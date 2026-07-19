import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/server/auth/types";
import { db } from "@/server/db/client";
import {
  actualizarMaterial,
  crearMaterial,
  getMaterialConHistorial,
  listarMateriales,
  registrarMovimiento,
} from "@/server/db/inventario";

const appUrl = process.env.TEST_DATABASE_URL!;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL!;
const app = new pg.Pool({ connectionString: appUrl, max: 6 });
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
let ctxOtra: TenantContext;
let resinaId: string;

beforeAll(async () => {
  clinica = await crearClinica("Inventario A", "inv-a@clident.test");
  const otra = await crearClinica("Inventario B", "inv-b@clident.test");
  ctx = {
    usuarioId: clinica.usuarioId,
    clinicaId: clinica.clinicaId,
    membresiaId: clinica.membresiaId,
    roles: ["ADMINISTRADOR"],
  };
  ctxOtra = {
    usuarioId: otra.usuarioId,
    clinicaId: otra.clinicaId,
    membresiaId: otra.membresiaId,
    roles: ["ADMINISTRADOR"],
  };
});

afterAll(async () => {
  await Promise.all([app.end(), migrator.end(), db.$disconnect()]);
});

describe("materiales y movimientos", () => {
  it("el stock inicial nace con su movimiento de entrada", async () => {
    const material = await crearMaterial(ctx, {
      nombre: "Resina compuesta A2",
      unidad: "jeringa",
      stockActual: 20,
      stockMinimo: 5,
      costoUnitarioCentavos: 1200,
    });
    resinaId = material.id;

    const detalle = await getMaterialConHistorial(ctx, resinaId);
    expect(detalle!.stockActual).toBe(20);
    expect(detalle!.movimientos).toHaveLength(1);
    expect(detalle!.movimientos[0].tipo).toBe("ENTRADA");
    expect(detalle!.movimientos[0].saldoDespues).toBe(20);
  });

  it("saldoDespues sale del RETURNING y encadena correctamente", async () => {
    await registrarMovimiento(ctx, {
      materialId: resinaId,
      tipo: "SALIDA",
      cantidad: 3,
      ajusteNegativo: false,
      motivo: null,
    });
    const salida = await registrarMovimiento(ctx, {
      materialId: resinaId,
      tipo: "SALIDA",
      cantidad: 2,
      ajusteNegativo: false,
      motivo: null,
    });
    expect(salida!.saldoDespues).toBe(15);

    const detalle = await getMaterialConHistorial(ctx, resinaId);
    expect(detalle!.stockActual).toBe(15);
    // El historial guarda el signo: las salidas son negativas.
    expect(detalle!.movimientos[0].cantidad).toBe(-2);
  });

  it("la alerta salta cuando el stock llega al mínimo, no cuando lo cruza", async () => {
    await registrarMovimiento(ctx, {
      materialId: resinaId,
      tipo: "SALIDA",
      cantidad: 10,
      ajusteNegativo: false,
      motivo: null,
    });
    const materiales = await listarMateriales(ctx);
    const resina = materiales.find((m) => m.id === resinaId)!;
    expect(resina.stockActual).toBe(5);
    expect(resina.bajoMinimo).toBe(true);
  });

  it("una salida mayor al stock la rechaza el CHECK: el stock negativo es imposible", async () => {
    await expect(
      registrarMovimiento(ctx, {
        materialId: resinaId,
        tipo: "SALIDA",
        cantidad: 100,
        ajusteNegativo: false,
        motivo: null,
      }),
    ).rejects.toMatchObject({ code: expect.anything() });

    // El stock no se movió.
    const detalle = await getMaterialConHistorial(ctx, resinaId);
    expect(detalle!.stockActual).toBe(5);
  });

  it("el ajuste corrige el conteo físico y deja constancia del motivo", async () => {
    const ajuste = await registrarMovimiento(ctx, {
      materialId: resinaId,
      tipo: "AJUSTE",
      cantidad: 2,
      ajusteNegativo: true,
      motivo: "Conteo físico: faltaban 2 jeringas.",
    });
    expect(ajuste!.saldoDespues).toBe(3);
    const detalle = await getMaterialConHistorial(ctx, resinaId);
    expect(detalle!.movimientos[0].motivo).toContain("Conteo físico");
  });
});

describe("concurrencia: salidas simultáneas nunca dejan stock negativo", () => {
  it("cuatro salidas de 3 sobre un stock de 10 → una falla, el stock queda en 1", async () => {
    const material = await crearMaterial(ctx, {
      nombre: "Anestesia lidocaína",
      unidad: "cartucho",
      stockActual: 10,
      stockMinimo: 2,
      costoUnitarioCentavos: null,
    });

    const salidas = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        registrarMovimiento(ctx, {
          materialId: material.id,
          tipo: "SALIDA",
          cantidad: 3,
          ajusteNegativo: false,
          motivo: null,
        }),
      ),
    );
    const exitosas = salidas.filter((s) => s.status === "fulfilled").length;
    expect(exitosas).toBe(3);

    const detalle = await getMaterialConHistorial(ctx, material.id);
    expect(detalle!.stockActual).toBe(1);
    // Reconciliación #3: el contador coincide con la suma de sus movimientos.
    const suma = detalle!.movimientos.reduce((total, m) => total + m.cantidad, 0);
    expect(suma).toBe(detalle!.stockActual);
  });
});

describe("mecanismos de la base y aislamiento", () => {
  it("el historial de stock no se edita ni se borra", async () => {
    for (const consulta of [
      "UPDATE movimientos_inventario SET cantidad = 999",
      "DELETE FROM movimientos_inventario",
      "DELETE FROM materiales",
    ]) {
      await expect(
        conContexto({ clinicaId: clinica.clinicaId }, (cliente) => cliente.query(consulta)),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("un UPDATE directo que dejaría el stock negativo truena en el CHECK", async () => {
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, (cliente) =>
        cliente.query("UPDATE materiales SET stock_actual = -1 WHERE id = $1", [resinaId]),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("un movimiento con signo incoherente lo rechaza el CHECK", async () => {
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, (cliente) =>
        cliente.query(
          `INSERT INTO movimientos_inventario (id, clinica_id, material_id, tipo, cantidad, saldo_despues, registrado_por_id)
           VALUES ($1, $2, $3, 'ENTRADA', -5, 1, $4)`,
          [randomUUID(), clinica.clinicaId, resinaId, clinica.membresiaId],
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("desactivar no borra, y un material inactivo no admite movimientos", async () => {
    const material = await crearMaterial(ctx, {
      nombre: "Material a desactivar",
      unidad: "caja",
      stockActual: 4,
      stockMinimo: 1,
      costoUnitarioCentavos: null,
    });
    await actualizarMaterial(ctx, {
      materialId: material.id,
      nombre: material.nombre,
      unidad: material.unidad,
      stockMinimo: material.stockMinimo,
      costoUnitarioCentavos: null,
      activo: false,
    });

    const detalle = await getMaterialConHistorial(ctx, material.id);
    expect(detalle).not.toBeNull();
    expect(detalle!.activo).toBe(false);
    expect(
      await registrarMovimiento(ctx, {
        materialId: material.id,
        tipo: "SALIDA",
        cantidad: 1,
        ajusteNegativo: false,
        motivo: null,
      }),
    ).toBeNull();
  });

  it("cross-tenant: la otra clínica no ve ni alcanza estos materiales", async () => {
    expect(await listarMateriales(ctxOtra)).toEqual([]);
    expect(await getMaterialConHistorial(ctxOtra, resinaId)).toBeNull();
  });

  it("reconciliación #3: cero filas descuadradas, con datos de verdad", async () => {
    const guarda = await migrator.query("SELECT count(*)::int AS total FROM materiales");
    expect(guarda.rows[0].total).toBeGreaterThan(0);

    const descuadres = await migrator.query(
      `SELECT m.id FROM materiales m
       LEFT JOIN movimientos_inventario mv ON mv.material_id = m.id
       GROUP BY m.id, m.stock_actual
       HAVING m.stock_actual <> COALESCE(SUM(mv.cantidad), 0)`,
    );
    expect(descuadres.rows).toEqual([]);
  });
});
