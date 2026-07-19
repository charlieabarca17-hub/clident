import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sembrarDientes } from "../../prisma/seed/dientes.ts";
import { DIENTES } from "@/lib/dientes";
import { ErrorAgendaTraslape } from "@/lib/errors";
import {
  CrearAlertaMedicaSchema,
  DesactivarAlertaMedicaSchema,
} from "@/lib/validation/alertas-medicas";
import { CrearCitaSchema, ReprogramarCitaSchema } from "@/lib/validation/citas";
import { CrearPacienteSchema } from "@/lib/validation/pacientes";
import type { TenantContext } from "@/server/auth/types";
import { establecerPasswordConInvitacion, hashTokenInvitacion } from "@/server/auth/invitaciones";
import { listarMisMembresias, validarMembresiaActiva } from "@/server/auth/membresias";
import { autenticarCredenciales } from "@/server/auth/usuarios";
import { db } from "@/server/db/client";
import {
  crearAlertaMedica,
  desactivarAlertaMedica,
  listarAlertasMedicasActivas,
} from "@/server/db/alertas-medicas";
import {
  cancelarCita,
  crearCita,
  listarCitasPaciente,
  reprogramarCita,
} from "@/server/db/citas";
import {
  buscarPacientes,
  crearPaciente,
  getPacienteAdministrativo,
  getPacienteDetalle,
  getPacienteParaAgenda,
  listarPacientes,
} from "@/server/db/pacientes";
import { conTenant, conUsuario } from "@/server/db/tenant";

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
      "alertas_medicas",
      "auditoria",
      "categorias_tratamiento",
      "citas",
      "clinicas",
      "desactivaciones_alertas_medicas",
      "diagnostico_dientes",
      "diagnosticos",
      "dientes_ref",
      "enmiendas_procedimiento",
      "estados_superficie",
      "eventos_odontograma",
      "expedientes",
      "membresias",
      "pacientes",
      "plan_item_dientes",
      "plan_items",
      "planes",
      "plantillas_categoria",
      "plantillas_tratamiento",
      "procedimiento_dientes",
      "procedimientos",
      "sucursales",
      "superficies_diente",
      "tratamientos",
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
       WHERE n.nspname = 'public' AND c.relname IN ('alertas_medicas','clinicas','citas','desactivaciones_alertas_medicas','expedientes','sucursales','membresias','auditoria','pacientes','categorias_tratamiento','tratamientos','diagnosticos','diagnostico_dientes','eventos_odontograma','estados_superficie','planes','plan_items','plan_item_dientes','procedimientos','procedimiento_dientes','enmiendas_procedimiento')
       ORDER BY c.relname`,
    );
    expect(resultado.rows).toHaveLength(21);
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
         AND table_name IN ('alertas_medicas', 'clinicas', 'citas', 'desactivaciones_alertas_medicas', 'expedientes', 'sucursales', 'usuarios', 'membresias', 'auditoria', 'pacientes', 'categorias_tratamiento', 'tratamientos', 'diagnosticos', 'eventos_odontograma', 'estados_superficie', 'planes', 'plan_items', 'procedimientos', 'enmiendas_procedimiento')
         AND data_type LIKE 'timestamp%'
       ORDER BY table_name, column_name`,
    );
    expect(resultado.rows).toHaveLength(46);
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

    const privilegiosBase = await migrator.query(
      `SELECT
        has_database_privilege('clident_migrator', current_database(), 'CREATE') AS migrator_create,
        has_database_privilege('clident_app', current_database(), 'CREATE') AS app_create,
        has_database_privilege('clident_readonly', current_database(), 'CREATE') AS readonly_create`,
    );
    expect(privilegiosBase.rows[0]).toEqual({
      migrator_create: true,
      app_create: false,
      readonly_create: false,
    });

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
      pacientes: ["SELECT", "INSERT", "UPDATE"],
      expedientes: ["SELECT", "INSERT", "UPDATE"],
      alertas_medicas: ["SELECT", "INSERT"],
      desactivaciones_alertas_medicas: ["SELECT", "INSERT"],
      citas: ["SELECT", "INSERT", "UPDATE"],
      auditoria: ["SELECT", "INSERT"],
      dientes_ref: ["SELECT"],
      superficies_diente: ["SELECT"],
      plantillas_categoria: ["SELECT"],
      plantillas_tratamiento: ["SELECT"],
      categorias_tratamiento: ["SELECT", "INSERT", "UPDATE"],
      tratamientos: ["SELECT", "INSERT", "UPDATE"],
      diagnosticos: ["SELECT", "INSERT", "UPDATE"],
      diagnostico_dientes: ["SELECT", "INSERT", "DELETE"],
      eventos_odontograma: ["SELECT", "INSERT"],
      estados_superficie: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      planes: ["SELECT", "INSERT", "UPDATE"],
      // PARCIALMENTE_INMUTABLE: sin UPDATE de tabla; las columnas mutables se
      // verifican aparte con has_column_privilege.
      plan_items: ["SELECT", "INSERT"],
      plan_item_dientes: ["SELECT", "INSERT", "DELETE"],
      procedimientos: ["SELECT", "INSERT"],
      procedimiento_dientes: ["SELECT", "INSERT"],
      enmiendas_procedimiento: ["SELECT", "INSERT"],
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

  it("plan_items solo permite UPDATE en estado y actualizado_en", async () => {
    const resultado = await migrator.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'plan_items'
         AND has_column_privilege('clident_app', 'public.plan_items', column_name, 'UPDATE')
       ORDER BY column_name`,
    );
    expect(resultado.rows.map(({ column_name }) => column_name)).toEqual([
      "actualizado_en",
      "estado",
    ]);
  });

  it("procedimientos solo permite UPDATE en la lista canónica de §10.5", async () => {
    const resultado = await migrator.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'procedimientos'
         AND has_column_privilege('clident_app', 'public.procedimientos', column_name, 'UPDATE')
       ORDER BY column_name`,
    );
    expect(resultado.rows.map(({ column_name }) => column_name)).toEqual([
      "actualizado_en",
      "anulado_en",
      "anulado_por_id",
      "estado",
      "motivo_anulacion",
      "notas_clinicas",
    ]);
  });

  it("append-only no concede UPDATE ni siquiera por columna", async () => {
    for (const tabla of ["alertas_medicas", "auditoria", "desactivaciones_alertas_medicas", "eventos_odontograma", "procedimiento_dientes", "enmiendas_procedimiento"]) {
      const resultado = await migrator.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
           AND has_column_privilege('clident_app', format('public.%I', $1), column_name, 'UPDATE')`,
        [tabla],
      );
      expect(resultado.rows, tabla).toEqual([]);
    }
  });

  it("clident_readonly tiene SELECT y ningún otro privilegio en toda tabla", async () => {
    const tablas = [
      "alertas_medicas", "auditoria", "categorias_tratamiento", "clinicas", "citas", "desactivaciones_alertas_medicas", "diagnostico_dientes", "diagnosticos", "dientes_ref", "estados_superficie", "eventos_odontograma", "expedientes",
      "membresias", "pacientes", "plan_item_dientes", "plan_items", "planes", "plantillas_categoria", "plantillas_tratamiento", "procedimiento_dientes", "procedimientos", "enmiendas_procedimiento", "sucursales", "superficies_diente", "tratamientos", "usuarios",
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
      "alertas_medicas", "auditoria", "categorias_tratamiento", "citas", "clinicas", "desactivaciones_alertas_medicas", "diagnostico_dientes", "diagnosticos", "enmiendas_procedimiento", "estados_superficie", "eventos_odontograma", "expedientes", "membresias", "pacientes", "plan_item_dientes", "plan_items", "planes", "procedimiento_dientes", "procedimientos", "sucursales", "tratamientos",
    ]);
    for (const fila of resultado.rows) {
      expect(fila.tiene_migracion, `${fila.tablename}.migración`).toBe(true);
      expect(fila.tiene_aplicacion, `${fila.tablename}.aplicación`).toBe(true);
    }
  });

  it("Agenda conserva CHECK y los dos EXCLUDE de PostgreSQL", async () => {
    const resultado = await migrator.query(
      `SELECT conname, contype, pg_get_constraintdef(oid) AS definicion
       FROM pg_constraint WHERE conrelid = 'public.citas'::regclass
       ORDER BY conname`,
    );
    const porNombre = Object.fromEntries(
      resultado.rows.map(({ conname, contype, definicion }) => [conname, { contype, definicion }]),
    );
    expect(porNombre.citas_rango_valido).toMatchObject({ contype: "c" });
    expect(porNombre.citas_sin_traslape).toMatchObject({ contype: "x" });
    expect(porNombre.citas_paciente_sin_traslape).toMatchObject({ contype: "x" });
    for (const nombre of ["citas_sin_traslape", "citas_paciente_sin_traslape"] as const) {
      expect(porNombre[nombre].definicion).toContain("tstzrange");
      expect(porNombre[nombre].definicion).toContain("[)");
      expect(porNombre[nombre].definicion).toContain("CANCELADA");
    }
  });
});

describe("paciente base", () => {
  const contextoA = (): TenantContext => ({
    clinicaId: clinicaA.clinicaId,
    usuarioId: clinicaA.usuarioId,
    membresiaId: "membresia-admin-a",
    roles: ["ADMINISTRADOR"],
  });
  const contextoB = (): TenantContext => ({
    clinicaId: clinicaB.clinicaId,
    usuarioId: clinicaB.usuarioId,
    membresiaId: "membresia-odontologo-b",
    roles: ["ODONTOLOGO"],
  });
  const contextoRecepcionA = (): TenantContext => ({
    clinicaId: clinicaA.clinicaId,
    usuarioId: usuarioSoloAId,
    membresiaId: "membresia-recepcion-a",
    roles: ["RECEPCION"],
  });

  let pacienteAId: string;
  let pacienteBId: string;
  const dui = "01234567-8";

  it("crea un menor con responsable completo y solo expone el DUI enmascarado", async () => {
    const resultado = await crearPaciente(contextoA(), CrearPacienteSchema.parse({
      nombres: "Sofía",
      apellidos: "López",
      fechaNacimiento: "2015-07-17",
      telefono: "7000-0001",
      responsable: {
        nombre: "Marta López",
        tipoDocumento: "DUI",
        numeroDocumento: dui,
        telefono: "7000-0000",
        parentesco: "Madre",
      },
      contactoEmergencia: { nombre: "Marta López", telefono: "7000-0000" },
    }));
    pacienteAId = resultado.id;
    expect(resultado).toMatchObject({ duiEnmascarado: null, nombres: "Sofía" });
    expect("dui" in resultado).toBe(false);
    const expediente = await migrator.query(
      "SELECT clinica_id, paciente_id FROM expedientes WHERE paciente_id = $1",
      [pacienteAId],
    );
    expect(expediente.rows).toEqual([{ clinica_id: clinicaA.clinicaId, paciente_id: pacienteAId }]);
  });

  it("permite el mismo DUI en clínicas distintas, pero no dos veces en la misma", async () => {
    const resultado = await crearPaciente(contextoB(), CrearPacienteSchema.parse({
      nombres: "Carlos",
      apellidos: "Abarca",
      fechaNacimiento: "1990-01-20",
      dui,
      telefono: "7000-0002",
      contactoEmergencia: { nombre: "Ana Abarca", telefono: "7000-0003" },
    }));
    pacienteBId = resultado.id;
    expect(resultado.duiEnmascarado).toBe("********-8");

    await expect(
      migrator.query(
        `INSERT INTO pacientes (
           id, clinica_id, nombres, apellidos, fecha_nacimiento, dui, telefono,
           contacto_emergencia_nombre, contacto_emergencia_telefono, actualizado_en
         ) VALUES ($1, $2, 'Duplicado', 'A', DATE '1990-01-20', $3, '7000-0004',
                   'Ana', '7000-0003', CURRENT_TIMESTAMP)`,
        [randomUUID(), clinicaB.clinicaId, dui],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rechaza un DUI con forma inválida y un responsable incompleto desde la base", async () => {
    const base = [randomUUID(), clinicaA.clinicaId, "Prueba", "Paciente", "7000-0005", "Ana", "7000-0006"];
    await expect(
      migrator.query(
        `INSERT INTO pacientes (
           id, clinica_id, nombres, apellidos, fecha_nacimiento, dui, telefono,
           contacto_emergencia_nombre, contacto_emergencia_telefono, actualizado_en
         ) VALUES ($1, $2, $3, $4, DATE '1990-01-20', 'invalido', $5, $6, $7, CURRENT_TIMESTAMP)`,
        base,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      migrator.query(
        `INSERT INTO pacientes (
           id, clinica_id, nombres, apellidos, fecha_nacimiento, telefono,
           responsable_nombre, contacto_emergencia_nombre, contacto_emergencia_telefono, actualizado_en
         ) VALUES ($1, $2, $3, $4, DATE '1990-01-20', $5, 'Incompleto', $6, $7, CURRENT_TIMESTAMP)`,
        base,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("aísla paciente y selector de Agenda entre clínicas", async () => {
    await expect(getPacienteParaAgenda(contextoA(), pacienteBId)).resolves.toBeNull();
    await expect(getPacienteAdministrativo(contextoA(), pacienteBId)).resolves.toBeNull();
    await expect(getPacienteDetalle(contextoA(), pacienteBId)).resolves.toBeNull();

    const lecturaDirecta = await conContexto(
      { usuarioId: clinicaA.usuarioId, clinicaId: clinicaA.clinicaId },
      (cliente) => cliente.query("SELECT id FROM pacientes WHERE id = $1", [pacienteBId]),
    );
    expect(lecturaDirecta.rows).toEqual([]);

    const escrituraDirecta = await conContexto(
      { usuarioId: clinicaA.usuarioId, clinicaId: clinicaA.clinicaId },
      (cliente) => cliente.query(
        "UPDATE pacientes SET nombres = 'No debe cambiar' WHERE id = $1 RETURNING id",
        [pacienteBId],
      ),
    );
    expect(escrituraDirecta.rows).toEqual([]);
    const filaOriginal = await migrator.query("SELECT nombres FROM pacientes WHERE id = $1", [pacienteBId]);
    expect(filaOriginal.rows).toEqual([{ nombres: "Carlos" }]);

    const propio = await getPacienteParaAgenda(contextoB(), pacienteBId);
    expect(propio).toMatchObject({ id: pacienteBId, duiEnmascarado: "********-8" });
    expect("dui" in (propio ?? {})).toBe(false);
  });

  it("da a recepción una ficha administrativa, sin documentos completos", async () => {
    const ficha = await getPacienteAdministrativo(contextoRecepcionA(), pacienteAId);
    expect(ficha).toMatchObject({
      id: pacienteAId,
      responsable: { nombre: "Marta López", parentesco: "Madre" },
      contactoEmergencia: { nombre: "Marta López", telefono: "7000-0000" },
    });
    expect(JSON.stringify(ficha)).not.toContain(dui);
    expect("dui" in (ficha ?? {})).toBe(false);
  });

  it("permite buscar por teléfono del responsable sin devolver el DUI completo", async () => {
    const encontrados = await buscarPacientes(contextoA(), "7000-0000");
    expect(encontrados).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: pacienteAId, duiEnmascarado: null }),
    ]));
    expect(JSON.stringify(encontrados)).not.toContain(dui);
  });

  it("limita el DUI completo a paciente:read_pii y deja auditoría", async () => {
    await expect(getPacienteDetalle(contextoRecepcionA(), pacienteAId)).rejects.toThrow(
      "No tenés permiso para realizar esta acción.",
    );

    const detalle = await getPacienteDetalle(contextoB(), pacienteBId);
    expect(detalle).toMatchObject({ id: pacienteBId, dui });
    const auditoria = await migrator.query(
      `SELECT accion, entidad_id FROM auditoria
       WHERE clinica_id = $1 AND accion = 'PACIENTE_PII_CONSULTADO'`,
      [clinicaB.clinicaId],
    );
    expect(auditoria.rows).toEqual([{ accion: "PACIENTE_PII_CONSULTADO", entidad_id: pacienteBId }]);
  });

  it("mantiene la lista del paciente sin DUI completo", async () => {
    const lista = await listarPacientes(contextoB());
    expect(lista).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: pacienteBId, duiEnmascarado: "********-8" }),
    ]));
    expect(JSON.stringify(lista)).not.toContain(dui);
  });

});

describe("expediente clínico y alertas médicas", () => {
  const contextoAdminA = (): TenantContext => ({
    clinicaId: clinicaA.clinicaId,
    usuarioId: clinicaA.usuarioId,
    membresiaId: clinicaA.membresiaId,
    roles: ["ADMINISTRADOR"],
  });
  const contextoOdontologoB = (): TenantContext => ({
    clinicaId: clinicaB.clinicaId,
    usuarioId: clinicaB.usuarioId,
    membresiaId: clinicaB.membresiaId,
    roles: ["ODONTOLOGO"],
  });
  const contextoRecepcionA = (): TenantContext => ({
    clinicaId: clinicaA.clinicaId,
    usuarioId: usuarioSoloAId,
    membresiaId: "membresia-recepcion-a",
    roles: ["RECEPCION"],
  });

  let pacienteAId: string;
  let pacienteBId: string;
  let expedienteAId: string;
  let expedienteBId: string;
  let alertaBId: string;

  beforeAll(async () => {
    await migrator.query(
      `UPDATE membresias SET roles = ARRAY['ADMINISTRADOR', 'ODONTOLOGO']::"Rol"[]
       WHERE id = $1`,
      [clinicaA.membresiaId],
    );
    const [pacienteA, pacienteB] = await Promise.all([
      crearPaciente(contextoAdminA(), CrearPacienteSchema.parse({
        nombres: "Paciente", apellidos: "Expediente A", fechaNacimiento: "1990-01-20",
        telefono: "7000-0200", contactoEmergencia: { nombre: "Contacto A", telefono: "7000-0201" },
      })),
      crearPaciente(contextoOdontologoB(), CrearPacienteSchema.parse({
        nombres: "Paciente", apellidos: "Expediente B", fechaNacimiento: "1991-01-20",
        telefono: "7000-0202", contactoEmergencia: { nombre: "Contacto B", telefono: "7000-0203" },
      })),
    ]);
    pacienteAId = pacienteA.id;
    pacienteBId = pacienteB.id;
    const expedientes = await migrator.query(
      "SELECT id, paciente_id FROM expedientes WHERE paciente_id = ANY($1::text[])",
      [[pacienteAId, pacienteBId]],
    );
    expedienteAId = expedientes.rows.find(({ paciente_id }) => paciente_id === pacienteAId)!.id;
    expedienteBId = expedientes.rows.find(({ paciente_id }) => paciente_id === pacienteBId)!.id;
  });

  const contextoOdontologoA = (): TenantContext => ({
    clinicaId: clinicaA.clinicaId,
    usuarioId: clinicaA.usuarioId,
    membresiaId: clinicaA.membresiaId,
    roles: ["ADMINISTRADOR", "ODONTOLOGO"],
  });

  it("crea exactamente un expediente por paciente y lo amarra a su clínica", async () => {
    const resultado = await migrator.query(
      "SELECT clinica_id, paciente_id FROM expedientes WHERE paciente_id = ANY($1::text[]) ORDER BY paciente_id",
      [[pacienteAId, pacienteBId]],
    );
    const esperado = [
      { clinica_id: clinicaA.clinicaId, paciente_id: pacienteAId },
      { clinica_id: clinicaB.clinicaId, paciente_id: pacienteBId },
    ].sort((a, b) => a.paciente_id.localeCompare(b.paciente_id));
    expect(resultado.rows).toEqual(esperado);
  });

  it("reserva las alertas para personal clínico y no cruza clínicas", async () => {
    const alerta = await crearAlertaMedica(contextoOdontologoB(), CrearAlertaMedicaSchema.parse({
      pacienteId: pacienteBId,
      titulo: "Alergia a penicilina",
      detalle: "Confirmar antes de prescribir.",
    }));
    if (!alerta) throw new Error("El expediente de prueba debe existir.");
    alertaBId = alerta.id;
    expect(alerta).toMatchObject({ titulo: "Alergia a penicilina", creadaPorNombre: "Administrador de prueba" });

    await expect(listarAlertasMedicasActivas(contextoRecepcionA(), pacienteAId)).rejects.toThrow(
      "No tenés permiso para realizar esta acción.",
    );
    await expect(listarAlertasMedicasActivas(contextoOdontologoA(), pacienteBId)).resolves.toEqual([]);

    const lecturaDirecta = await conContexto(
      { usuarioId: clinicaA.usuarioId, clinicaId: clinicaA.clinicaId },
      (cliente) => cliente.query("SELECT id FROM alertas_medicas WHERE id = $1", [alertaBId]),
    );
    expect(lecturaDirecta.rows).toEqual([]);
  });

  it("desactiva con motivo, deja auditoría y no permite una segunda desactivación", async () => {
    await expect(desactivarAlertaMedica(
      contextoOdontologoB(),
      alertaBId,
      DesactivarAlertaMedicaSchema.parse({ motivoDesactivacion: "El paciente confirmó que no presenta esa alergia." }),
    )).resolves.toBe(true);
    await expect(desactivarAlertaMedica(
      contextoOdontologoB(),
      alertaBId,
      DesactivarAlertaMedicaSchema.parse({ motivoDesactivacion: "No debe sobrescribir el motivo original." }),
    )).resolves.toBe(false);
    await expect(listarAlertasMedicasActivas(contextoOdontologoB(), pacienteBId)).resolves.toEqual([]);

    const auditoria = await migrator.query(
      "SELECT accion FROM auditoria WHERE entidad_id = $1 ORDER BY creado_en",
      [alertaBId],
    );
    expect(auditoria.rows).toEqual([
      { accion: "ALERTA_MEDICA_CREADA" },
      { accion: "ALERTA_MEDICA_DESACTIVADA" },
    ]);
  });

  it("la base bloquea cruces entre clínicas y la credencial runtime no puede reactivar", async () => {
    await expect(
      migrator.query(
        `INSERT INTO alertas_medicas (
           id, clinica_id, expediente_id, titulo, creada_por_id
         ) VALUES ($1, $2, $3, 'No debe cruzar clínica', $4)`,
        [randomUUID(), clinicaA.clinicaId, expedienteBId, clinicaA.membresiaId],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    const alertaAId = randomUUID();
    await migrator.query(
      `INSERT INTO alertas_medicas (id, clinica_id, expediente_id, titulo, creada_por_id)
       VALUES ($1, $2, $3, 'Alerta de prueba', $4)`,
      [alertaAId, clinicaA.clinicaId, expedienteAId, clinicaA.membresiaId],
    );
    await expect(
      migrator.query(
        `INSERT INTO desactivaciones_alertas_medicas (
           id, clinica_id, alerta_id, desactivada_por_id, motivo_desactivacion
         ) VALUES ($1, $2, $3, $4, '   ')`,
        [randomUUID(), clinicaA.clinicaId, alertaAId, clinicaA.membresiaId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      conContexto(
        { usuarioId: clinicaB.usuarioId, clinicaId: clinicaB.clinicaId },
        (cliente) => cliente.query("UPDATE alertas_medicas SET titulo = 'No permitido' WHERE id = $1", [alertaBId]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      conContexto(
        { usuarioId: clinicaB.usuarioId, clinicaId: clinicaB.clinicaId },
        (cliente) => cliente.query("DELETE FROM desactivaciones_alertas_medicas WHERE alerta_id = $1", [alertaBId]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("Agenda", () => {
  const contextoA = (): TenantContext => ({
    clinicaId: clinicaA.clinicaId,
    usuarioId: clinicaA.usuarioId,
    membresiaId: "membresia-admin-a",
    roles: ["ADMINISTRADOR"],
  });
  const contextoB = (): TenantContext => ({
    clinicaId: clinicaB.clinicaId,
    usuarioId: clinicaB.usuarioId,
    membresiaId: "membresia-odontologo-b",
    roles: ["ODONTOLOGO"],
  });

  let odontologoAId: string;
  let odontologoB2Id: string;
  let pacienteAId: string;
  let pacienteBId: string;
  let pacienteB2Id: string;

  async function crearOdontologo(clinicaId: string, correo: string): Promise<string> {
    const usuarioId = randomUUID();
    const membresiaId = randomUUID();
    await migrator.query(
      `WITH usuario AS (
         INSERT INTO usuarios (id, correo, nombre, actualizado_en)
         VALUES ($1, $2, 'Odontólogo Agenda', CURRENT_TIMESTAMP)
       )
       INSERT INTO membresias (id, clinica_id, usuario_id, roles, actualizado_en)
       VALUES ($3, $4, $1, ARRAY['ODONTOLOGO']::"Rol"[], CURRENT_TIMESTAMP)`,
      [usuarioId, correo, membresiaId, clinicaId],
    );
    return membresiaId;
  }

  function datosCita(
    pacienteId: string,
    odontologoId: string,
    hora: string,
    duracionMinutos = 60,
  ) {
    return CrearCitaSchema.parse({
      pacienteId,
      odontologoId,
      fecha: "2030-01-17",
      hora,
      duracionMinutos,
      motivo: "Control",
    });
  }

  beforeAll(async () => {
    odontologoAId = await crearOdontologo(clinicaA.clinicaId, "agenda-a@clident.test");
    odontologoB2Id = await crearOdontologo(clinicaB.clinicaId, "agenda-b2@clident.test");
    const [pacienteA, pacienteB, pacienteB2] = await Promise.all([
      crearPaciente(contextoA(), CrearPacienteSchema.parse({
        nombres: "Paciente", apellidos: "Agenda A", fechaNacimiento: "1990-01-20",
        telefono: "7000-0010", contactoEmergencia: { nombre: "Contacto A", telefono: "7000-0011" },
      })),
      crearPaciente(contextoB(), CrearPacienteSchema.parse({
        nombres: "Paciente", apellidos: "Agenda B", fechaNacimiento: "1991-01-20",
        telefono: "7000-0012", contactoEmergencia: { nombre: "Contacto B", telefono: "7000-0013" },
      })),
      crearPaciente(contextoB(), CrearPacienteSchema.parse({
        nombres: "Segundo", apellidos: "Paciente B", fechaNacimiento: "1992-01-20",
        telefono: "7000-0014", contactoEmergencia: { nombre: "Contacto B2", telefono: "7000-0015" },
      })),
    ]);
    pacienteAId = pacienteA.id;
    pacienteBId = pacienteB.id;
    pacienteB2Id = pacienteB2.id;
  });

  it("impide los cuatro solapamientos, permite adyacencia y protege al paciente", async () => {
    await crearCita(contextoB(), datosCita(pacienteBId, clinicaB.membresiaId, "09:00"));

    for (const [hora, duracion] of [["09:30", 60], ["09:15", 30], ["08:30", 120], ["09:00", 60]] as const) {
      await expect(
        crearCita(contextoB(), datosCita(pacienteB2Id, clinicaB.membresiaId, hora, duracion)),
      ).rejects.toBeInstanceOf(ErrorAgendaTraslape);
    }

    await expect(
      crearCita(contextoB(), datosCita(pacienteB2Id, clinicaB.membresiaId, "10:00")),
    ).resolves.toMatchObject({ estado: "PENDIENTE", horaInicio: "10:00" });

    await expect(
      crearCita(contextoB(), datosCita(pacienteBId, odontologoB2Id, "09:00")),
    ).rejects.toMatchObject({ code: "AGENDA_TRASLAPE", message: expect.stringContaining("paciente") });

    await expect(
      crearCita(contextoB(), datosCita(pacienteB2Id, odontologoB2Id, "09:00")),
    ).resolves.toMatchObject({ odontologo: { id: odontologoB2Id } });
  });

  it("cancelar libera el horario sin borrar la cita", async () => {
    const original = await crearCita(contextoB(), datosCita(pacienteBId, clinicaB.membresiaId, "12:00"));
    const cancelada = await cancelarCita(contextoB(), original.id);
    expect(cancelada).toMatchObject({ id: original.id, estado: "CANCELADA" });

    await expect(
      crearCita(contextoB(), datosCita(pacienteB2Id, clinicaB.membresiaId, "12:00")),
    ).resolves.toMatchObject({ estado: "PENDIENTE" });

    const auditoria = await migrator.query(
      "SELECT accion FROM auditoria WHERE entidad_id = $1 ORDER BY creado_en",
      [original.id],
    );
    expect(auditoria.rows.map(({ accion }) => accion)).toEqual(["CITA_CREADA", "CITA_CANCELADA"]);
  });

  it("reprogramar conserva la cita pero deja que PostgreSQL rechace el conflicto", async () => {
    const cita = await crearCita(contextoB(), datosCita(pacienteBId, clinicaB.membresiaId, "14:00"));
    await crearCita(contextoB(), datosCita(pacienteB2Id, clinicaB.membresiaId, "15:00"));
    const conflicto = ReprogramarCitaSchema.parse({ fecha: "2030-01-17", hora: "15:00", duracionMinutos: 60 });
    await expect(reprogramarCita(contextoB(), cita.id, conflicto)).rejects.toBeInstanceOf(ErrorAgendaTraslape);
  });

  it("en una carrera concurrente solo una reserva llega a persistir", async () => {
    const resultados = await Promise.allSettled([
      crearCita(contextoB(), datosCita(pacienteBId, clinicaB.membresiaId, "17:00")),
      crearCita(contextoB(), datosCita(pacienteB2Id, clinicaB.membresiaId, "17:00")),
    ]);
    expect(resultados.filter((resultado) => resultado.status === "fulfilled")).toHaveLength(1);
    const rechazado = resultados.find((resultado) => resultado.status === "rejected");
    expect(rechazado).toMatchObject({ reason: expect.any(ErrorAgendaTraslape) });
  });

  it("RLS no deja ver ni cancelar una cita de otra clínica", async () => {
    const citaA = await crearCita(contextoA(), datosCita(pacienteAId, odontologoAId, "09:00"));
    const lectura = await conContexto(
      { usuarioId: clinicaB.usuarioId, clinicaId: clinicaB.clinicaId },
      (cliente) => cliente.query("SELECT id FROM citas WHERE id = $1", [citaA.id]),
    );
    expect(lectura.rows).toEqual([]);

    await expect(listarCitasPaciente(contextoB(), pacienteAId)).resolves.toEqual([]);
    await expect(listarCitasPaciente(contextoA(), pacienteAId)).resolves.toEqual([
      expect.objectContaining({ id: citaA.id }),
    ]);

    await expect(cancelarCita(contextoB(), citaA.id)).resolves.toBeNull();
    const estado = await migrator.query("SELECT estado FROM citas WHERE id = $1", [citaA.id]);
    expect(estado.rows).toEqual([{ estado: "PENDIENTE" }]);
  });

  it("la FK compuesta rechaza una cita de una clínica apuntando al paciente de otra", async () => {
    await expect(
      migrator.query(
        `INSERT INTO citas (
           id, clinica_id, sucursal_id, paciente_id, odontologo_id, inicio_en, fin_en, actualizado_en
         ) VALUES ($1, $2, $3, $4, $5, '2030-02-01 15:00:00+00', '2030-02-01 16:00:00+00', CURRENT_TIMESTAMP)`,
        [randomUUID(), clinicaA.clinicaId, clinicaA.sucursalId, pacienteBId, odontologoAId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
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
