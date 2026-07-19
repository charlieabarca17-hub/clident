import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PLANTILLAS_CATEGORIA } from "../../prisma/seed/categorias.ts";
import { PLANTILLAS_TRATAMIENTO } from "../../prisma/seed/tratamientos.ts";
import type { TenantContext } from "@/server/auth/types";
import { db } from "@/server/db/client";
import {
  actualizarTratamiento,
  clonarCatalogo,
  crearTratamiento,
  getTratamiento,
  listarCatalogo,
} from "@/server/db/catalogo";

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
  contexto: { usuarioId?: string; clinicaId?: string },
  operacion: (cliente: PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await app.connect();
  try {
    await cliente.query("BEGIN");
    if (contexto.usuarioId) {
      await cliente.query("SELECT set_config('app.usuario_id', $1, true)", [contexto.usuarioId]);
    }
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

function contexto(clinica: Bootstrap): TenantContext {
  return {
    usuarioId: clinica.usuarioId,
    clinicaId: clinica.clinicaId,
    membresiaId: clinica.membresiaId,
    roles: ["ADMINISTRADOR"],
  };
}

let clinicaA: Bootstrap;
let clinicaB: Bootstrap;
let ctxA: TenantContext;
let ctxB: TenantContext;

beforeAll(async () => {
  clinicaA = await crearClinica("Catálogo A", "catalogo-a@clident.test");
  clinicaB = await crearClinica("Catálogo B", "catalogo-b@clident.test");
  ctxA = contexto(clinicaA);
  ctxB = contexto(clinicaB);
});

afterAll(async () => {
  await Promise.all([app.end(), migrator.end(), db.$disconnect()]);
});

describe("plantillas globales", () => {
  it("están sembradas y la credencial runtime no puede escribirlas", async () => {
    const total = await app.query("SELECT count(*)::int AS total FROM plantillas_tratamiento");
    expect(total.rows[0].total).toBe(PLANTILLAS_TRATAMIENTO.length);

    await expect(
      app.query(
        `INSERT INTO plantillas_categoria (id, nombre, orden) VALUES ('hackeo', 'Hackeo', 99)`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      app.query(`UPDATE plantillas_tratamiento SET precio_sugerido_centavos = 1`),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("clonarCatalogo", () => {
  it("copia las plantillas completas a la clínica, una sola vez", async () => {
    const resultado = await clonarCatalogo(ctxA);
    expect(resultado).toEqual({
      categorias: PLANTILLAS_CATEGORIA.length,
      tratamientos: PLANTILLAS_TRATAMIENTO.length,
    });

    const catalogo = await listarCatalogo(ctxA);
    expect(catalogo).toHaveLength(12);
    expect(catalogo.flatMap((c) => c.tratamientos)).toHaveLength(PLANTILLAS_TRATAMIENTO.length);

    // Clonar encima de un catálogo existente está prohibido: no mezcla ni resincroniza.
    await expect(clonarCatalogo(ctxA)).rejects.toThrow(/ya tiene catálogo/);
  });

  it("el catálogo clonado pertenece solo a la clínica que lo clonó", async () => {
    expect(await listarCatalogo(ctxB)).toEqual([]);

    await clonarCatalogo(ctxB);
    const catalogoB = await listarCatalogo(ctxB);
    expect(catalogoB.flatMap((c) => c.tratamientos)).toHaveLength(PLANTILLAS_TRATAMIENTO.length);

    // Sin contexto de clínica, RLS falla cerrado: cero filas, no todas.
    const sinContexto = await conContexto({}, async (cliente) => {
      const filas = await cliente.query("SELECT count(*)::int AS total FROM tratamientos");
      return filas.rows[0].total;
    });
    expect(sinContexto).toBe(0);
  });

  it("cambiar un precio en A no toca el mismo tratamiento en B", async () => {
    const resinaA = (await listarCatalogo(ctxA))
      .flatMap((c) => c.tratamientos)
      .find((t) => t.codigo === "RES-01")!;
    const actualizado = await actualizarTratamiento(ctxA, resinaA.id, {
      nombre: resinaA.nombre,
      precioListaCentavos: 9999,
      activo: true,
    });
    expect(actualizado?.precioListaCentavos).toBe(9999);

    const resinaB = (await listarCatalogo(ctxB))
      .flatMap((c) => c.tratamientos)
      .find((t) => t.codigo === "RES-01")!;
    expect(resinaB.precioListaCentavos).not.toBe(9999);
  });
});

describe("catálogo por clínica", () => {
  it("rechaza códigos duplicados dentro de la clínica y los permite entre clínicas", async () => {
    const base = {
      codigo: "ZZZ-01",
      nombre: "Tratamiento de prueba",
      precioListaCentavos: 1000,
      alcance: "BOCA" as const,
      requiereDiente: false,
      permiteMultiplesDientes: false,
      permiteSuperficies: false,
      permiteMultiplesSuperficies: false,
      requiereDiagnostico: false,
      permiteMultiplesSesiones: false,
    };
    const categoriaA = (await listarCatalogo(ctxA))[0];
    const creado = await crearTratamiento(ctxA, { ...base, categoriaId: categoriaA.id });
    expect(creado.codigo).toBe("ZZZ-01");

    await expect(
      crearTratamiento(ctxA, { ...base, categoriaId: categoriaA.id }),
    ).rejects.toMatchObject({ code: "P2002" });

    const categoriaB = (await listarCatalogo(ctxB))[0];
    const creadoEnB = await crearTratamiento(ctxB, { ...base, categoriaId: categoriaB.id });
    expect(creadoEnB.codigo).toBe("ZZZ-01");
  });

  it("no acepta una categoría de otra clínica", async () => {
    const categoriaB = (await listarCatalogo(ctxB))[0];
    await expect(
      crearTratamiento(ctxA, {
        categoriaId: categoriaB.id,
        codigo: "ZZZ-02",
        nombre: "Cruce de clínicas",
        precioListaCentavos: 1000,
        alcance: "BOCA",
        requiereDiente: false,
        permiteMultiplesDientes: false,
        permiteSuperficies: false,
        permiteMultiplesSuperficies: false,
        requiereDiagnostico: false,
        permiteMultiplesSesiones: false,
      }),
    ).rejects.toThrow(/no existe/);
  });

  it("cross-tenant devuelve null, no FORBIDDEN", async () => {
    const tratamientoB = (await listarCatalogo(ctxB)).flatMap((c) => c.tratamientos)[0];
    expect(await getTratamiento(ctxA, tratamientoB.id)).toBeNull();
  });

  it("los CHECK de la base rechazan banderas incoherentes y precios negativos", async () => {
    const categoriaA = await conContexto({ clinicaId: clinicaA.clinicaId }, async (cliente) => {
      const filas = await cliente.query("SELECT id FROM categorias_tratamiento LIMIT 1");
      return filas.rows[0].id as string;
    });

    // Superficies sin diente: incoherente aunque la app se salte Zod.
    await expect(
      conContexto({ clinicaId: clinicaA.clinicaId }, (cliente) =>
        cliente.query(
          `INSERT INTO tratamientos (
             id, clinica_id, categoria_id, codigo, nombre, precio_lista_centavos, alcance,
             requiere_diente, permite_multiples_dientes, permite_superficies,
             permite_multiples_superficies, requiere_diagnostico, permite_multiples_sesiones,
             actualizado_en
           ) VALUES ($1, $2, $3, 'MAL-01', 'Incoherente', 100, 'BOCA',
                     false, false, true, false, false, false, CURRENT_TIMESTAMP)`,
          [randomUUID(), clinicaA.clinicaId, categoriaA],
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      conContexto({ clinicaId: clinicaA.clinicaId }, (cliente) =>
        cliente.query(
          `INSERT INTO tratamientos (
             id, clinica_id, categoria_id, codigo, nombre, precio_lista_centavos, alcance,
             requiere_diente, permite_multiples_dientes, permite_superficies,
             permite_multiples_superficies, requiere_diagnostico, permite_multiples_sesiones,
             actualizado_en
           ) VALUES ($1, $2, $3, 'MAL-02', 'Precio negativo', -1, 'BOCA',
                     false, false, false, false, false, false, CURRENT_TIMESTAMP)`,
          [randomUUID(), clinicaA.clinicaId, categoriaA],
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("desactivar no borra: la fila sigue y DELETE está negado por privilegio", async () => {
    const tratamiento = (await listarCatalogo(ctxA))
      .flatMap((c) => c.tratamientos)
      .find((t) => t.codigo === "ZZZ-01")!;
    const desactivado = await actualizarTratamiento(ctxA, tratamiento.id, {
      nombre: tratamiento.nombre,
      precioListaCentavos: tratamiento.precioListaCentavos,
      activo: false,
    });
    expect(desactivado?.activo).toBe(false);

    const sigue = await getTratamiento(ctxA, tratamiento.id);
    expect(sigue).not.toBeNull();

    await expect(
      conContexto({ clinicaId: clinicaA.clinicaId }, (cliente) =>
        cliente.query("DELETE FROM tratamientos WHERE codigo = 'ZZZ-01'"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("estructuralmente no existe dónde guardar una superficie en el catálogo (§4.7)", async () => {
    const resultado = await migrator.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('tratamientos', 'plantillas_tratamiento')
         AND udt_name = 'Superficie'`,
    );
    expect(resultado.rows).toEqual([]);
  });
});
