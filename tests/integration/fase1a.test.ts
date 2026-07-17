import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sembrarDientes } from "../../prisma/seed/dientes.ts";
import { DIENTES } from "@/lib/dientes";
import { establecerPasswordConInvitacion, hashTokenInvitacion } from "@/server/auth/invitaciones";
import { listarMisMembresias, validarMembresiaActiva } from "@/server/auth/membresias";
import { autenticarCredenciales } from "@/server/auth/usuarios";
import { db } from "@/server/db/client";
import { conTenant, conUsuario } from "@/server/db/tenant";

const appUrl = process.env.TEST_DATABASE_URL!;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL!;
const app = new pg.Pool({ connectionString: appUrl, max: 2 });
const migrator = new pg.Pool({ connectionString: migrationUrl, max: 2 });

type Bootstrap = { clinicaId: string; usuarioId: string; sucursalId: string };

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

let clinicaA: Bootstrap;
let clinicaB: Bootstrap;
let usuarioSoloAId: string;

beforeAll(async () => {
  clinicaA = await crearClinica("Clínica A", "compartido@clident.test");
  clinicaB = await crearClinica("Clínica B", "compartido@clident.test");
  expect(clinicaB.usuarioId).toBe(clinicaA.usuarioId);
  await migrator.query(
    `UPDATE membresias SET roles = ARRAY['ODONTOLOGO']::"Rol"[]
     WHERE clinica_id = $1 AND usuario_id = $2`,
    [clinicaB.clinicaId, clinicaB.usuarioId],
  );
  usuarioSoloAId = randomUUID();
  await migrator.query(
    `WITH usuario AS (
       INSERT INTO usuarios (id, correo, nombre, actualizado_en)
       VALUES ($1, 'solo-a@clident.test', 'Usuario solo A', CURRENT_TIMESTAMP)
     )
     INSERT INTO membresias (id, clinica_id, usuario_id, roles, actualizado_en)
     VALUES ($2, $3, $1, ARRAY['RECEPCION']::"Rol"[], CURRENT_TIMESTAMP)`,
    [usuarioSoloAId, randomUUID(), clinicaA.clinicaId],
  );
});

afterAll(async () => {
  await Promise.all([app.end(), migrator.end(), db.$disconnect()]);
});

describe("bootstrap y referencias globales", () => {
  it("crea clínica, sede, administrador, membresía y auditoría", async () => {
    const resultado = await migrator.query(
      `SELECT
        (SELECT count(*)::int FROM clinicas) AS clinicas,
        (SELECT count(*)::int FROM sucursales) AS sucursales,
        (SELECT count(*)::int FROM usuarios) AS usuarios,
        (SELECT count(*)::int FROM membresias) AS membresias,
        (SELECT count(*)::int FROM auditoria) AS auditorias`,
    );
    expect(resultado.rows[0]).toEqual({
      clinicas: 2,
      sucursales: 2,
      usuarios: 2,
      membresias: 3,
      auditorias: 2,
    });
  });

  it("proyecta exactamente los 52 dientes y sus superficies", async () => {
    const dientes = await migrator.query("SELECT fdi FROM dientes_ref ORDER BY fdi");
    const superficies = await migrator.query(
      "SELECT fdi, superficie FROM superficies_diente ORDER BY fdi, superficie",
    );
    expect(dientes.rows.map(({ fdi }) => fdi)).toEqual(DIENTES.map(({ fdi }) => fdi).sort((a, b) => a - b));
    const esperado = DIENTES.flatMap((diente) =>
      diente.superficies.map((superficie) => `${diente.fdi}:${superficie}`),
    ).sort();
    const real = superficies.rows
      .map(({ fdi, superficie }) => `${fdi}:${superficie}`)
      .sort();
    expect(real).toEqual(esperado);
  });

  it("mantiene la proyección dental exacta al repetir la semilla", async () => {
    await sembrarDientes(migrationUrl);
    const superficies = await migrator.query("SELECT count(*)::int AS total FROM superficies_diente");
    expect(superficies.rows[0].total).toBe(312);
  });

  it("impide que la aplicación altere la dentición humana", async () => {
    await expect(
      app.query(
        `INSERT INTO dientes_ref (fdi, denticion, tipo, cuadrante, posicion, nombre)
         VALUES (19, 'PERMANENTE', 'MOLAR', 1, 9, 'Inválido')`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("aislamiento RLS", () => {
  it("antes de elegir clínica muestra solo las membresías y clínicas propias", async () => {
    const resultado = await conContexto({ usuarioId: clinicaA.usuarioId }, async (cliente) => {
      const membresias = await cliente.query(
        "SELECT clinica_id, roles::text[] AS roles FROM membresias ORDER BY clinica_id",
      );
      const clinicas = await cliente.query("SELECT id FROM clinicas ORDER BY id");
      const sucursales = await cliente.query("SELECT id FROM sucursales");
      return {
        membresias: membresias.rows,
        clinicas: clinicas.rowCount,
        sucursales: sucursales.rowCount,
      };
    });
    expect(resultado.clinicas).toBe(2);
    expect(resultado.sucursales).toBe(0);
    expect(resultado.membresias).toEqual(
      expect.arrayContaining([
        { clinica_id: clinicaA.clinicaId, roles: ["ADMINISTRADOR"] },
        { clinica_id: clinicaB.clinicaId, roles: ["ODONTOLOGO"] },
      ]),
    );
  });

  it("con clínica activa no ve sucursales de otra clínica", async () => {
    const filas = await conContexto({ usuarioId: clinicaA.usuarioId, clinicaId: clinicaA.clinicaId },
      (cliente) => cliente.query("SELECT clinica_id FROM sucursales"));
    expect(filas.rows).toEqual([{ clinica_id: clinicaA.clinicaId }]);
  });

  it("un usuario de una sola clínica no enumera membresías ni clínicas ajenas", async () => {
    const resultado = await conContexto({ usuarioId: usuarioSoloAId }, async (cliente) => {
      const membresias = await cliente.query("SELECT clinica_id FROM membresias");
      const clinicas = await cliente.query("SELECT id FROM clinicas");
      return { membresias: membresias.rows, clinicas: clinicas.rows };
    });
    expect(resultado).toEqual({
      membresias: [{ clinica_id: clinicaA.clinicaId }],
      clinicas: [{ id: clinicaA.clinicaId }],
    });
  });

  it("rechaza mover una fila hacia otra clínica", async () => {
    await expect(
      conContexto({ usuarioId: clinicaA.usuarioId, clinicaId: clinicaA.clinicaId },
        (cliente) => cliente.query("UPDATE sucursales SET clinica_id = $1 WHERE id = $2", [clinicaB.clinicaId, clinicaA.sucursalId])),
    ).rejects.toMatchObject({ code: "42501" });
    const fila = await migrator.query("SELECT clinica_id FROM sucursales WHERE id = $1", [clinicaA.sucursalId]);
    expect(fila.rows[0].clinica_id).toBe(clinicaA.clinicaId);
  });

  it("rechaza insertar una sucursal o membresía para otra clínica", async () => {
    await expect(
      conContexto({ usuarioId: clinicaA.usuarioId, clinicaId: clinicaA.clinicaId },
        (cliente) => cliente.query(
          `INSERT INTO sucursales (id, clinica_id, nombre, actualizado_en)
           VALUES ($1, $2, 'Cruce', CURRENT_TIMESTAMP)`,
          [randomUUID(), clinicaB.clinicaId],
        )),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      conContexto({ usuarioId: clinicaA.usuarioId, clinicaId: clinicaA.clinicaId },
        (cliente) => cliente.query(
          `INSERT INTO membresias (id, clinica_id, usuario_id, roles, actualizado_en)
           VALUES ($1, $2, $3, ARRAY['RECEPCION']::"Rol"[], CURRENT_TIMESTAMP)`,
          [randomUUID(), clinicaB.clinicaId, usuarioSoloAId],
        )),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("rechaza referencias inexistentes aunque opere el migrador", async () => {
    await expect(
      migrator.query(
        `INSERT INTO sucursales (id, clinica_id, nombre, actualizado_en)
         VALUES ($1, $2, 'Huérfana', CURRENT_TIMESTAMP)`,
        [randomUUID(), randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rechaza una membresía sin roles", async () => {
    await expect(
      migrator.query(
        `INSERT INTO membresias
           (id, clinica_id, usuario_id, roles, actualizado_en)
         VALUES ($1, $2, $3, ARRAY[]::"Rol"[], CURRENT_TIMESTAMP)`,
        [randomUUID(), clinicaA.clinicaId, clinicaA.usuarioId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      migrator.query(
        `INSERT INTO membresias
           (id, clinica_id, usuario_id, roles, actualizado_en)
         VALUES ($1, $2, $3, ARRAY[NULL]::"Rol"[], CURRENT_TIMESTAMP)`,
        [randomUUID(), clinicaB.clinicaId, usuarioSoloAId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rechaza una membresía duplicada para el mismo usuario y clínica", async () => {
    await expect(
      migrator.query(
        `INSERT INTO membresias
           (id, clinica_id, usuario_id, roles, actualizado_en)
         VALUES ($1, $2, $3, ARRAY['RECEPCION']::"Rol"[], CURRENT_TIMESTAMP)`,
        [randomUUID(), clinicaA.clinicaId, usuarioSoloAId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
});

describe("estructura de seguridad", () => {
  it("toda tabla pública está clasificada", async () => {
    const clasificadas = [
      "auditoria",
      "clinicas",
      "dientes_ref",
      "membresias",
      "sucursales",
      "superficies_diente",
      "usuarios",
    ];
    const resultado = await migrator.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
       ORDER BY tablename`,
    );
    expect(resultado.rows.map(({ tablename }) => tablename)).toEqual(clasificadas);
  });

  it("toda tabla de inquilino tiene RLS habilitado y forzado", async () => {
    const resultado = await migrator.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname IN ('clinicas','sucursales','membresias','auditoria')
       ORDER BY c.relname`,
    );
    expect(resultado.rows).toHaveLength(4);
    expect(resultado.rows.every((fila) => fila.relrowsecurity && fila.relforcerowsecurity)).toBe(true);
  });

  it("usuarios es la única excepción global deliberada de RLS", async () => {
    const resultado = await migrator.query(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE oid = 'public.usuarios'::regclass`,
    );
    expect(resultado.rows[0]).toEqual({ relrowsecurity: false, relforcerowsecurity: false });
  });

  it("todos los instantes usan timestamptz con precisión de milisegundos", async () => {
    const resultado = await migrator.query(
      `SELECT table_name, column_name, data_type, datetime_precision
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('clinicas', 'sucursales', 'usuarios', 'membresias', 'auditoria')
         AND data_type LIKE 'timestamp%'
       ORDER BY table_name, column_name`,
    );
    expect(resultado.rows).toHaveLength(11);
    expect(resultado.rows.every(({ data_type }) => data_type === "timestamp with time zone")).toBe(true);
    expect(resultado.rows.every(({ datetime_precision }) => datetime_precision === 3)).toBe(true);
  });

  it("los roles no evaden RLS y respetan las clases de tabla", async () => {
    const roles = await migrator.query(
      `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
       WHERE rolname IN ('clident_app','clident_migrator','clident_readonly') ORDER BY rolname`,
    );
    expect(roles.rows).toHaveLength(3);
    expect(roles.rows.every((rol) => !rol.rolsuper && !rol.rolbypassrls)).toBe(true);

    const privilegios = await migrator.query(
      `SELECT
        has_table_privilege('clident_app', 'auditoria', 'INSERT') AS audit_insert,
        has_table_privilege('clident_app', 'auditoria', 'UPDATE') AS audit_update,
        has_table_privilege('clident_app', 'auditoria', 'DELETE') AS audit_delete,
        has_table_privilege('clident_app', 'dientes_ref', 'SELECT') AS dientes_select,
        has_table_privilege('clident_app', 'dientes_ref', 'INSERT') AS dientes_insert,
        has_table_privilege('clident_readonly', 'membresias', 'UPDATE') AS readonly_update`,
    );
    expect(privilegios.rows[0]).toEqual({
      audit_insert: true,
      audit_update: false,
      audit_delete: false,
      dientes_select: true,
      dientes_insert: false,
      readonly_update: false,
    });
  });

  it("los privilegios reales coinciden exactamente con cada clase", async () => {
    const clases: Record<string, readonly string[]> = {
      clinicas: ["SELECT", "INSERT", "UPDATE"],
      sucursales: ["SELECT", "INSERT", "UPDATE"],
      usuarios: ["SELECT", "INSERT", "UPDATE"],
      membresias: ["SELECT", "INSERT", "UPDATE"],
      auditoria: ["SELECT", "INSERT"],
      dientes_ref: ["SELECT"],
      superficies_diente: ["SELECT"],
    };
    const verbos = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"] as const;
    for (const [tabla, permitidos] of Object.entries(clases)) {
      for (const verbo of verbos) {
        const resultado = await migrator.query(
          "SELECT has_table_privilege('clident_app', $1::text, $2::text) AS permitido",
          [tabla, verbo],
        );
        expect(resultado.rows[0].permitido, `${tabla}.${verbo}`).toBe(permitidos.includes(verbo));
      }
    }
  });

  it("append-only no concede UPDATE ni siquiera por columna", async () => {
    const resultado = await migrator.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'auditoria'
         AND has_column_privilege('clident_app', 'public.auditoria', column_name, 'UPDATE')`,
    );
    expect(resultado.rows).toEqual([]);
  });

  it("clident_readonly tiene SELECT y ningún otro privilegio en toda tabla", async () => {
    const tablas = [
      "auditoria", "clinicas", "dientes_ref", "membresias",
      "sucursales", "superficies_diente", "usuarios",
    ];
    const verbos = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
    for (const tabla of tablas) {
      for (const verbo of verbos) {
        const resultado = await migrator.query(
          "SELECT has_table_privilege('clident_readonly', $1::text, $2::text) AS permitido",
          [tabla, verbo],
        );
        expect(resultado.rows[0].permitido, `${tabla}.${verbo}`).toBe(verbo === "SELECT");
      }
    }
  });

  it("cada tabla con RLS declara política de aplicación y de migración", async () => {
    const resultado = await migrator.query(
      `SELECT tablename,
              bool_or(policyname LIKE 'migraciones_%') AS tiene_migracion,
              bool_or(policyname NOT LIKE 'migraciones_%') AS tiene_aplicacion
       FROM pg_policies
       WHERE schemaname = 'public'
       GROUP BY tablename ORDER BY tablename`,
    );
    expect(resultado.rows.map(({ tablename }) => tablename)).toEqual([
      "auditoria", "clinicas", "membresias", "sucursales",
    ]);
    for (const fila of resultado.rows) {
      expect(fila.tiene_migracion, `${fila.tablename}.migración`).toBe(true);
      expect(fila.tiene_aplicacion, `${fila.tablename}.aplicación`).toBe(true);
    }
  });
});

describe("autenticación y contexto de Fase 1B", () => {
  it("conUsuario solo descubre las membresías propias", async () => {
    const filas = await conUsuario(usuarioSoloAId, (tx) =>
      tx.membresia.findMany({ select: { clinicaId: true } }),
    );
    expect(filas).toEqual([{ clinicaId: clinicaA.clinicaId }]);
  });

  it("conTenant fija ambos GUCs dentro de una sola transacción", async () => {
    const filas = await conTenant(
      { usuarioId: usuarioSoloAId, clinicaId: clinicaA.clinicaId },
      (tx) => tx.sucursal.findMany({ select: { clinicaId: true } }),
    );
    expect(filas).toEqual([{ clinicaId: clinicaA.clinicaId }]);
  });

  it("revalida membresía activa y rechaza otra clínica", async () => {
    await expect(validarMembresiaActiva(usuarioSoloAId, clinicaA.clinicaId)).resolves.toMatchObject({
      clinicaId: clinicaA.clinicaId,
      roles: ["RECEPCION"],
    });
    await expect(validarMembresiaActiva(usuarioSoloAId, clinicaB.clinicaId)).resolves.toBeNull();
  });

  it("expulsa una clínica suspendida o vencida en la siguiente revalidación", async () => {
    const usuarioCompartidoId = clinicaA.usuarioId;
    await migrator.query("UPDATE clinicas SET estado = 'SUSPENDIDA' WHERE id = $1", [clinicaB.clinicaId]);
    try {
      await expect(validarMembresiaActiva(usuarioCompartidoId, clinicaB.clinicaId)).resolves.toBeNull();
      const visibles = await listarMisMembresias({ usuarioId: usuarioCompartidoId });
      expect(visibles.map(({ clinicaId }) => clinicaId)).not.toContain(clinicaB.clinicaId);
    } finally {
      await migrator.query("UPDATE clinicas SET estado = 'PRUEBA' WHERE id = $1", [clinicaB.clinicaId]);
    }

    await migrator.query(
      "UPDATE clinicas SET vigente_hasta = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE id = $1",
      [clinicaB.clinicaId],
    );
    try {
      await expect(validarMembresiaActiva(usuarioCompartidoId, clinicaB.clinicaId)).resolves.toBeNull();
      const visibles = await listarMisMembresias({ usuarioId: usuarioCompartidoId });
      expect(visibles.map(({ clinicaId }) => clinicaId)).not.toContain(clinicaB.clinicaId);
    } finally {
      await migrator.query("UPDATE clinicas SET vigente_hasta = NULL WHERE id = $1", [clinicaB.clinicaId]);
    }
  });

  it("rechaza credenciales inexistentes, incorrectas o sin contraseña establecida", async () => {
    await expect(
      autenticarCredenciales({ correo: "nadie@clident.test", password: "Password-seguro-123" }),
    ).resolves.toBeNull();
    await expect(
      autenticarCredenciales({ correo: "solo-a@clident.test", password: "Password-seguro-123" }),
    ).resolves.toBeNull();
  });

  it("rechaza una invitación vencida sin alterar la identidad", async () => {
    const usuarioId = randomUUID();
    const token = "token-vencido-de-prueba-con-entropia-suficiente-123456";
    await migrator.query(
      `INSERT INTO usuarios (id, correo, nombre, token_invitacion_hash, token_invitacion_expira_en, actualizado_en)
       VALUES ($1, 'invitado-vencido@clident.test', 'Invitado vencido', $2,
               CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP)`,
      [usuarioId, hashTokenInvitacion(token)],
    );

    await expect(establecerPasswordConInvitacion(token, "Password-seguro-123")).resolves.toBeNull();
    const resultado = await migrator.query(
      "SELECT password_hash, token_invitacion_hash FROM usuarios WHERE id = $1",
      [usuarioId],
    );
    expect(resultado.rows[0]).toEqual({
      password_hash: null,
      token_invitacion_hash: hashTokenInvitacion(token),
    });
  });

  it("consume la invitación una sola vez y permite autenticar con Argon2id", async () => {
    const token = "token-de-prueba-con-entropia-suficiente-123456789";
    await migrator.query(
      `UPDATE usuarios SET password_hash = NULL, token_invitacion_hash = $1,
         token_invitacion_expira_en = CURRENT_TIMESTAMP + INTERVAL '1 hour'
       WHERE id = $2`,
      [hashTokenInvitacion(token), usuarioSoloAId],
    );

    await expect(establecerPasswordConInvitacion(token, "Password-seguro-123")).resolves.toMatchObject({
      id: usuarioSoloAId,
    });
    await expect(establecerPasswordConInvitacion(token, "Otro-password-123")).resolves.toBeNull();
    await expect(
      autenticarCredenciales({ correo: "SOLO-A@CLIDENT.TEST", password: "Password-seguro-123" }),
    ).resolves.toMatchObject({ id: usuarioSoloAId, email: "solo-a@clident.test" });
    await expect(
      autenticarCredenciales({ correo: "solo-a@clident.test", password: "Password-incorrecto-123" }),
    ).resolves.toBeNull();
    const resultado = await migrator.query(
      "SELECT password_hash, token_invitacion_hash, token_invitacion_expira_en FROM usuarios WHERE id = $1",
      [usuarioSoloAId],
    );
    expect(resultado.rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(resultado.rows[0].token_invitacion_hash).toBeNull();
    expect(resultado.rows[0].token_invitacion_expira_en).toBeNull();
  });
});
