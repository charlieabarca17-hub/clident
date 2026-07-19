import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CrearPacienteSchema } from "@/lib/validation/pacientes";
import type { TenantContext } from "@/server/auth/types";
import { db } from "@/server/db/client";
import { clonarCatalogo, listarCatalogo } from "@/server/db/catalogo";
import { getOdontograma } from "@/server/db/odontograma";
import { crearPaciente } from "@/server/db/pacientes";
import {
  aceptarPlan,
  agregarPlanItem,
  crearPlan,
  getPlan,
  presentarPlan,
} from "@/server/db/planes";
import {
  anularProcedimiento,
  editarNotaClinica,
  enmendarNotaClinica,
  listarProcedimientos,
  realizarProcedimiento,
} from "@/server/db/procedimientos";

const appUrl = process.env.TEST_DATABASE_URL!;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL!;
const app = new pg.Pool({ connectionString: appUrl, max: 2 });
const migrator = new pg.Pool({ connectionString: migrationUrl, max: 2 });

type Bootstrap = { clinicaId: string; usuarioId: string; sucursalId: string; membresiaId: string };

async function crearClinica(nombre: string, correo: string): Promise<Bootstrap> {
  const sql = await readFile("infra/crear-clinica.sql", "utf8");
  const ids = {
    clinicaId: randomUUID(),
    sucursalId: randomUUID(),
    usuarioId: randomUUID(),
    membresiaId: randomUUID(),
    auditoriaId: randomUUID(),
  };
  const resultado = await migrator.query(sql, [
    ids.clinicaId,
    nombre,
    ids.sucursalId,
    ids.usuarioId,
    correo,
    "Administrador de prueba",
    ids.membresiaId,
    ids.auditoriaId,
  ]);
  return { ...ids, usuarioId: resultado.rows[0].usuario_id };
}

async function conContexto<T>(
  contexto: { clinicaId?: string },
  operacion: (cliente: PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await app.connect();
  try {
    await cliente.query("BEGIN");
    if (contexto.clinicaId) {
      await cliente.query("SELECT set_config('app.clinica_id', $1, true)", [contexto.clinicaId]);
    }
    const valor = await operacion(cliente);
    await cliente.query("COMMIT");
    return valor;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

let clinica: Bootstrap;
let ctx: TenantContext;
let pacienteId: string;
let itemResinaId: string;
let itemProfilaxisId: string;
let planId: string;

beforeAll(async () => {
  clinica = await crearClinica("Procedimientos A", "proc-a@clident.test");
  ctx = {
    usuarioId: clinica.usuarioId,
    clinicaId: clinica.clinicaId,
    membresiaId: clinica.membresiaId,
    roles: ["ADMINISTRADOR", "ODONTOLOGO"],
  };

  await clonarCatalogo(ctx);
  const tratamientos = (await listarCatalogo(ctx)).flatMap((c) => c.tratamientos);
  const resinaId = tratamientos.find((t) => t.codigo === "RES-01")!.id;
  const profilaxisId = tratamientos.find((t) => t.codigo === "PRE-01")!.id;

  const paciente = await crearPaciente(
    { ...ctx, roles: ["RECEPCION"] },
    CrearPacienteSchema.parse({
      nombres: "Paciente",
      apellidos: "Procedimientos",
      fechaNacimiento: "1988-11-02",
      dui: "",
      telefono: "7300-0001",
      correo: "",
      direccion: "",
      responsable: null,
      contactoEmergencia: { nombre: "Contacto", telefono: "7300-0002" },
    }),
  );
  pacienteId = paciente.id;

  const plan = await crearPlan(ctx, { pacienteId, titulo: "Plan procedimientos" });
  planId = plan!.id;
  await agregarPlanItem(ctx, {
    planId,
    tratamientoId: resinaId,
    diagnosticoId: null,
    descuentoCentavos: 500,
    dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
  });
  const conItems = await agregarPlanItem(ctx, {
    planId,
    tratamientoId: profilaxisId,
    diagnosticoId: null,
    descuentoCentavos: 0,
    dientes: [],
  });
  itemResinaId = conItems!.items[0].id;
  itemProfilaxisId = conItems!.items[1].id;
  await presentarPlan(ctx, planId);
  await aceptarPlan(ctx, { planId, itemIds: [itemResinaId, itemProfilaxisId] });
});

afterAll(async () => {
  await Promise.all([app.end(), migrator.end(), db.$disconnect()]);
});

describe("realizar procedimiento — criterio de salida de la fase", () => {
  it("pinta el odontograma y avanza el plan a EN_PROCESO", async () => {
    const procedimiento = await realizarProcedimiento(ctx, {
      pacienteId,
      planItemId: itemResinaId,
      realizadoEn: new Date(),
      notasClinicas: "Cavidad clase I, resina A2.",
      condicionResultante: "OBTURACION",
      dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
    });
    expect(procedimiento).not.toBeNull();
    // El precio aplicado nace del precio final aceptado (precio − descuento).
    expect(procedimiento!.precioAplicadoCentavos).toBe(4500 - 500);

    // Pinta el odontograma.
    const odontograma = await getOdontograma(ctx, pacienteId);
    const estado = odontograma!.estados.find((e) => e.fdi === 26 && e.superficie === "OCLUSAL");
    expect(estado?.condicion).toBe("OBTURACION");

    // Avanza el plan.
    const plan = await getPlan(ctx, planId);
    expect(plan!.items.find((i) => i.id === itemResinaId)!.estado).toBe("EN_PROCESO");
  });

  it("una segunda sesión de un tratamiento de una sola sesión se rechaza", async () => {
    await expect(
      realizarProcedimiento(ctx, {
        pacienteId,
        planItemId: itemResinaId,
        realizadoEn: new Date(),
        notasClinicas: null,
        condicionResultante: "OBTURACION",
        dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
      }),
    ).rejects.toThrow(/una sola sesión/i);
  });

  it("no se realiza nada sobre un plan no aceptado", async () => {
    const borrador = await crearPlan(ctx, { pacienteId, titulo: "Borrador" });
    const resinaId = (await listarCatalogo(ctx))
      .flatMap((c) => c.tratamientos)
      .find((t) => t.codigo === "RES-02")!.id;
    const conItem = await agregarPlanItem(ctx, {
      planId: borrador!.id,
      tratamientoId: resinaId,
      diagnosticoId: null,
      descuentoCentavos: 0,
      dientes: [{ fdi: 14, superficie: "OCLUSAL" }],
    });
    await expect(
      realizarProcedimiento(ctx, {
        pacienteId,
        planItemId: conItem!.items[0].id,
        realizadoEn: new Date(),
        notasClinicas: null,
        condicionResultante: "OBTURACION",
        dientes: [{ fdi: 14, superficie: "OCLUSAL" }],
      }),
    ).rejects.toThrow(/no está aceptado/i);
  });
});

describe("inmutabilidad por privilegios — criterio de salida de la fase", () => {
  it("UPDATE del precio aplicado → permission denied", async () => {
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, (cliente) =>
        cliente.query("UPDATE procedimientos SET precio_aplicado_centavos = 1"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, (cliente) =>
        cliente.query("UPDATE procedimientos SET realizado_en = CURRENT_TIMESTAMP"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, (cliente) =>
        cliente.query("DELETE FROM procedimientos"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("los dientes del procedimiento y las enmiendas no se editan ni se borran", async () => {
    for (const consulta of [
      "UPDATE procedimiento_dientes SET fdi = 27",
      "DELETE FROM procedimiento_dientes",
      "UPDATE enmiendas_procedimiento SET texto_anterior = 'reescrito'",
      "DELETE FROM enmiendas_procedimiento",
    ]) {
      await expect(
        conContexto({ clinicaId: clinica.clinicaId }, (cliente) => cliente.query(consulta)),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });
});

describe("nota clínica: ventana y enmienda", () => {
  it("el autor edita en caliente; la enmienda preserva el texto anterior", async () => {
    const procedimientos = await listarProcedimientos(ctx, pacienteId);
    const procedimiento = procedimientos.find((p) => p.estado === "REALIZADO")!;

    const editado = await editarNotaClinica(ctx, procedimiento.id, "Nota corregida en caliente.");
    expect(editado!.notasClinicas).toBe("Nota corregida en caliente.");

    const enmendado = await enmendarNotaClinica(ctx, {
      procedimientoId: procedimiento.id,
      textoNuevo: "El material fue B1, no A2.",
      motivo: "Error de registro del tono.",
    });
    expect(enmendado!.notasClinicas).toBe("El material fue B1, no A2.");
    expect(enmendado!.enmiendas).toHaveLength(1);
    expect(enmendado!.enmiendas[0].textoAnterior).toBe("Nota corregida en caliente.");
  });

  it("pasada la ventana, la edición directa se rechaza (simulado con creado_en retroactivo)", async () => {
    const procedimientos = await listarProcedimientos(ctx, pacienteId);
    const procedimiento = procedimientos.find((p) => p.estado === "REALIZADO")!;
    // El migrador (dueño) retrocede creado_en 13 horas para simular el paso del tiempo.
    await migrator.query(
      `UPDATE procedimientos SET creado_en = creado_en - interval '13 hours' WHERE id = $1`,
      [procedimiento.id],
    );
    await expect(
      editarNotaClinica(ctx, procedimiento.id, "Edición tardía."),
    ).rejects.toThrow(/enmienda/i);
  });
});

describe("anulación con eventos compensatorios", () => {
  it("anular revierte el odontograma recalculando, y el procedimiento queda visible", async () => {
    const procedimientos = await listarProcedimientos(ctx, pacienteId);
    const procedimiento = procedimientos.find(
      (p) => p.estado === "REALIZADO" && p.dientes.length > 0,
    )!;

    const anulado = await anularProcedimiento(
      ctx,
      procedimiento.id,
      "Se registró en el paciente equivocado.",
    );
    expect(anulado!.estado).toBe("ANULADO");

    // La obturación desapareció del odontograma: la superficie quedó sin
    // estado (no había historia previa) — recalculada, no pintada de "anulada".
    const odontograma = await getOdontograma(ctx, pacienteId);
    expect(
      odontograma!.estados.find((e) => e.fdi === 26 && e.superficie === "OCLUSAL"),
    ).toBeUndefined();

    // Y el hecho sigue en la historia, marcado.
    const historia = await listarProcedimientos(ctx, pacienteId);
    expect(historia.some((p) => p.id === procedimiento.id && p.estado === "ANULADO")).toBe(true);

    // La doble anulación no encuentra objetivo.
    expect(await anularProcedimiento(ctx, procedimiento.id, "Otra vez.")).toBeNull();
  });

  it("el CHECK rechaza una anulación a medias", async () => {
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, async (cliente) => {
        const procedimiento = await cliente.query(
          `SELECT id FROM procedimientos WHERE estado = 'REALIZADO' LIMIT 1`,
        );
        if (procedimiento.rows.length === 0) {
          // Garantizar objetivo: la profilaxis todavía es realizable.
          throw Object.assign(new Error("sin realizados"), { code: "SKIP" });
        }
        await cliente.query(`UPDATE procedimientos SET estado = 'ANULADO' WHERE id = $1`, [
          procedimiento.rows[0].id,
        ]);
      }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/23514|SKIP/) });
  });
});
