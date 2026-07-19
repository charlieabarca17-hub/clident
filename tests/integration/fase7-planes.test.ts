import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CrearPacienteSchema } from "@/lib/validation/pacientes";
import type { TenantContext } from "@/server/auth/types";
import { db } from "@/server/db/client";
import { actualizarTratamiento, clonarCatalogo, listarCatalogo } from "@/server/db/catalogo";
import { crearDiagnostico } from "@/server/db/diagnosticos";
import { crearPaciente } from "@/server/db/pacientes";
import {
  aceptarPlan,
  agregarPlanItem,
  anularPlan,
  anularPlanItem,
  cancelarPlanItem,
  completarPlanItem,
  crearPlan,
  getPlan,
  presentarPlan,
  rechazarPlan,
} from "@/server/db/planes";

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
let ctxOtraClinica: TenantContext;
let pacienteId: string;
let resinaId: string;
let endodonciaId: string;
let diagnosticoId: string;

const SIN_DIENTES: Array<{ fdi: number; superficie: "COMPLETO" }> = [];

beforeAll(async () => {
  clinica = await crearClinica("Planes A", "planes-a@clident.test");
  const otra = await crearClinica("Planes B", "planes-b@clident.test");
  ctx = {
    usuarioId: clinica.usuarioId,
    clinicaId: clinica.clinicaId,
    membresiaId: clinica.membresiaId,
    roles: ["ADMINISTRADOR", "ODONTOLOGO"],
  };
  ctxOtraClinica = {
    usuarioId: otra.usuarioId,
    clinicaId: otra.clinicaId,
    membresiaId: otra.membresiaId,
    roles: ["ADMINISTRADOR", "ODONTOLOGO"],
  };

  await clonarCatalogo(ctx);
  const tratamientos = (await listarCatalogo(ctx)).flatMap((c) => c.tratamientos);
  resinaId = tratamientos.find((t) => t.codigo === "RES-01")!.id;
  endodonciaId = tratamientos.find((t) => t.codigo === "END-01")!.id;

  const paciente = await crearPaciente(
    { ...ctx, roles: ["RECEPCION"] },
    CrearPacienteSchema.parse({
      nombres: "Paciente",
      apellidos: "Planes",
      fechaNacimiento: "1992-08-20",
      dui: "",
      telefono: "7200-0001",
      correo: "",
      direccion: "",
      responsable: null,
      contactoEmergencia: { nombre: "Contacto", telefono: "7200-0002" },
    }),
  );
  pacienteId = paciente.id;

  const diagnostico = await crearDiagnostico(ctx, {
    pacienteId,
    descripcion: "Pulpitis irreversible en el 26",
    notas: null,
    alcance: "DIENTE",
    dientes: [{ fdi: 26, superficie: "COMPLETO" }],
  });
  diagnosticoId = diagnostico!.id;
});

afterAll(async () => {
  await Promise.all([app.end(), migrator.end(), db.$disconnect()]);
});

describe("precio congelado (ADR-006)", () => {
  it("cambiar el catálogo no altera un ítem NI SIQUIERA en borrador", async () => {
    const plan = await crearPlan(ctx, { pacienteId, titulo: "Prueba snapshot" });
    const conItem = await agregarPlanItem(ctx, {
      planId: plan!.id,
      tratamientoId: resinaId,
      diagnosticoId: null,
      precioAcordadoCentavos: 5750,
      descuentoCentavos: 0,
      dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
    });
    const item = conItem!.items[0];
    expect(item.precioUnitarioCentavos).toBe(5750);
    const precioOriginal = item.precioUnitarioCentavos;
    const nombreOriginal = item.tratamientoNombre;

    // La clínica sube el precio y renombra el tratamiento en el catálogo.
    await actualizarTratamiento(ctx, resinaId, {
      nombre: "Restauración con resina compuesta premium",
      precioListaCentavos: precioOriginal + 5000,
      activo: true,
    });

    const relegido = await getPlan(ctx, plan!.id);
    expect(relegido!.items[0].precioUnitarioCentavos).toBe(precioOriginal);
    expect(relegido!.items[0].tratamientoNombre).toBe(nombreOriginal);
  });

  it("el precio del ítem no se puede escribir ni con UPDATE directo: privilegio por columna", async () => {
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, (cliente) =>
        cliente.query("UPDATE plan_items SET precio_unitario_centavos = 1"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, (cliente) =>
        cliente.query("UPDATE plan_items SET tratamiento_nombre = 'Otro'"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    // DELETE tampoco existe para plan_items.
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, (cliente) =>
        cliente.query("DELETE FROM plan_items"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("banderas del catálogo en el servidor", () => {
  it("un tratamiento que exige diagnóstico no entra sin él", async () => {
    const plan = await crearPlan(ctx, { pacienteId, titulo: "Banderas" });
    await expect(
      agregarPlanItem(ctx, {
        planId: plan!.id,
        tratamientoId: endodonciaId,
        diagnosticoId: null,
        precioAcordadoCentavos: 15000,
        descuentoCentavos: 0,
        dientes: [{ fdi: 26, superficie: "COMPLETO" }],
      }),
    ).rejects.toThrow(/exige un diagnóstico/i);

    // Con diagnóstico sí entra.
    const conItem = await agregarPlanItem(ctx, {
      planId: plan!.id,
      tratamientoId: endodonciaId,
      diagnosticoId,
      precioAcordadoCentavos: 15000,
      descuentoCentavos: 0,
      dientes: [{ fdi: 26, superficie: "COMPLETO" }],
    });
    expect(conItem!.items).toHaveLength(1);
  });

  it("una pieza de más, una superficie prohibida o boca completa con piezas: rechazados", async () => {
    const plan = await crearPlan(ctx, { pacienteId, titulo: "Banderas 2" });
    // La endodoncia no permite múltiples dientes.
    await expect(
      agregarPlanItem(ctx, {
        planId: plan!.id,
        tratamientoId: endodonciaId,
        diagnosticoId,
        precioAcordadoCentavos: 15000,
        descuentoCentavos: 0,
        dientes: [
          { fdi: 26, superficie: "COMPLETO" },
          { fdi: 27, superficie: "COMPLETO" },
        ],
      }),
    ).rejects.toThrow(/una sola pieza/i);

    // La profilaxis (BOCA) no lleva piezas.
    const profilaxisId = (await listarCatalogo(ctx))
      .flatMap((c) => c.tratamientos)
      .find((t) => t.codigo === "PRE-01")!.id;
    await expect(
      agregarPlanItem(ctx, {
        planId: plan!.id,
        tratamientoId: profilaxisId,
        diagnosticoId: null,
        precioAcordadoCentavos: 3000,
        descuentoCentavos: 0,
        dientes: [{ fdi: 26, superficie: "COMPLETO" }],
      }),
    ).rejects.toThrow(/boca completa/i);
  });
});

describe("ciclo de vida del plan", () => {
  it("borrador → presentado → aceptación parcial con una sola auditoría", async () => {
    const plan = await crearPlan(ctx, { pacienteId, titulo: "Ciclo completo" });
    await agregarPlanItem(ctx, {
      planId: plan!.id,
      tratamientoId: resinaId,
      diagnosticoId: null,
      precioAcordadoCentavos: 4500,
      descuentoCentavos: 500,
      dientes: [{ fdi: 14, superficie: "OCLUSAL" }],
    });
    const conItems = await agregarPlanItem(ctx, {
      planId: plan!.id,
      tratamientoId: endodonciaId,
      diagnosticoId,
      precioAcordadoCentavos: 15000,
      descuentoCentavos: 0,
      dientes: [{ fdi: 26, superficie: "COMPLETO" }],
    });
    const [itemResina, itemEndo] = conItems!.items;

    const presentado = await presentarPlan(ctx, plan!.id);
    expect(presentado!.estado).toBe("PRESENTADO");

    // El paciente acepta SOLO la endodoncia.
    const aceptado = await aceptarPlan(ctx, { planId: plan!.id, itemIds: [itemEndo.id] });
    expect(aceptado!.estado).toBe("ACEPTADO");
    expect(aceptado!.items.find((i) => i.id === itemEndo.id)!.estado).toBe("ACEPTADO");
    expect(aceptado!.items.find((i) => i.id === itemResina.id)!.estado).toBe("PROPUESTO");

    // Un solo registro de auditoría que nombra los ítems aceptados.
    const auditoria = await migrator.query(
      `SELECT detalle FROM auditoria WHERE accion = 'PLAN_ACEPTADO' AND entidad_id = $1`,
      [plan!.id],
    );
    expect(auditoria.rows).toHaveLength(1);
    expect(auditoria.rows[0].detalle.itemsAceptados).toEqual([itemEndo.id]);

    // Y aceptar NO creó deuda registrada (ADR-007). Se comprueba contra las
    // filas del paciente, no contra la existencia de la tabla: con todas las
    // migraciones aplicadas, `cargos` existe desde la fase 9.
    const cargos = await migrator.query(
      `SELECT count(*)::int AS total FROM cargos WHERE clinica_id = $1 AND paciente_id = $2`,
      [clinica.clinicaId, pacienteId],
    );
    expect(cargos.rows[0].total).toBe(0);
  });

  it("las transiciones prohibidas se rechazan", async () => {
    const plan = await crearPlan(ctx, { pacienteId, titulo: "Transiciones" });
    await agregarPlanItem(ctx, {
      planId: plan!.id,
      tratamientoId: resinaId,
      diagnosticoId: null,
      precioAcordadoCentavos: 4500,
      descuentoCentavos: 0,
      dientes: [{ fdi: 15, superficie: "OCLUSAL" }],
    });
    // Aceptar un borrador sin presentar: prohibido.
    const itemId = (await getPlan(ctx, plan!.id))!.items[0].id;
    await expect(aceptarPlan(ctx, { planId: plan!.id, itemIds: [itemId] })).rejects.toThrow(
      /no se puede aceptar/i,
    );
    // Completar un ítem de un plan no aceptado: prohibido (coherencia §4.5).
    await expect(completarPlanItem(ctx, itemId)).rejects.toThrow(/tratamiento PROPUESTO/i);

    // Rechazar y verificar que los ítems se quedan PROPUESTO.
    await presentarPlan(ctx, plan!.id);
    const rechazado = await rechazarPlan(ctx, plan!.id);
    expect(rechazado!.estado).toBe("RECHAZADO");
    expect(rechazado!.items[0].estado).toBe("PROPUESTO");

    // RECHAZADO → ANULADO sí existe (plan armado al paciente equivocado).
    const anulado = await anularPlan(ctx, plan!.id, "Se armó en el paciente equivocado.");
    expect(anulado!.estado).toBe("ANULADO");
    // Y anular NO cambió el estado de ningún ítem.
    expect(anulado!.items[0].estado).toBe("PROPUESTO");
  });

  it("completar es decisión humana y ANULADO exige COMPLETADO previo", async () => {
    const plan = await crearPlan(ctx, { pacienteId, titulo: "Ítems" });
    await agregarPlanItem(ctx, {
      planId: plan!.id,
      tratamientoId: resinaId,
      diagnosticoId: null,
      precioAcordadoCentavos: 4500,
      descuentoCentavos: 0,
      dientes: [{ fdi: 16, superficie: "OCLUSAL" }],
    });
    await presentarPlan(ctx, plan!.id);
    const itemId = (await getPlan(ctx, plan!.id))!.items[0].id;
    await aceptarPlan(ctx, { planId: plan!.id, itemIds: [itemId] });

    // ACEPTADO → COMPLETADO directo (tratamiento de una sesión).
    const completado = await completarPlanItem(ctx, itemId);
    expect(completado!.items[0].estado).toBe("COMPLETADO");

    // COMPLETADO → CANCELADO prohibido; ANULADO permitido.
    await expect(cancelarPlanItem(ctx, itemId, "Intento inválido")).rejects.toThrow(
      /no puede pasar a CANCELADO/i,
    );
    const anulado = await anularPlanItem(ctx, itemId, "Se marcó completado por error.");
    expect(anulado!.items[0].estado).toBe("ANULADO");
  });

  it("el CHECK de la base exige fechas y motivos coherentes con el estado", async () => {
    // Un plan ANULADO sin motivo es imposible incluso saltándose la aplicación.
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, async (cliente) => {
        const plan = await cliente.query(`SELECT id FROM planes WHERE estado = 'BORRADOR' LIMIT 1`);
        await cliente.query(`UPDATE planes SET estado = 'ANULADO' WHERE id = $1`, [
          plan.rows[0].id,
        ]);
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("cross-tenant devuelve null", async () => {
    const plan = await crearPlan(ctx, { pacienteId, titulo: "Aislamiento" });
    expect(await getPlan(ctxOtraClinica, plan!.id)).toBeNull();
    expect(await crearPlan(ctxOtraClinica, { pacienteId, titulo: "Cruce" })).toBeNull();
    expect(SIN_DIENTES).toEqual([]);
  });
});
