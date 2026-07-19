import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CrearPacienteSchema } from "@/lib/validation/pacientes";
import type { TenantContext } from "@/server/auth/types";
import { db } from "@/server/db/client";
import {
  anularDiagnostico,
  crearDiagnostico,
  listarDiagnosticos,
} from "@/server/db/diagnosticos";
import { crearPaciente } from "@/server/db/pacientes";

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
let ctxOdontologoA: TenantContext;
let ctxOdontologoB: TenantContext;
let ctxAdministradorA: TenantContext;
let pacienteId: string;

beforeAll(async () => {
  clinicaA = await crearClinica("Diagnósticos A", "dx-a@clident.test");
  clinicaB = await crearClinica("Diagnósticos B", "dx-b@clident.test");
  ctxOdontologoA = {
    usuarioId: clinicaA.usuarioId,
    clinicaId: clinicaA.clinicaId,
    membresiaId: clinicaA.membresiaId,
    roles: ["ODONTOLOGO"],
  };
  ctxOdontologoB = {
    usuarioId: clinicaB.usuarioId,
    clinicaId: clinicaB.clinicaId,
    membresiaId: clinicaB.membresiaId,
    roles: ["ODONTOLOGO"],
  };
  ctxAdministradorA = { ...ctxOdontologoA, roles: ["ADMINISTRADOR"] };

  const paciente = await crearPaciente(
    { ...ctxOdontologoA, roles: ["RECEPCION"] },
    CrearPacienteSchema.parse({
      nombres: "Paciente",
      apellidos: "Diagnósticos",
      fechaNacimiento: "1990-05-10",
      dui: "",
      telefono: "7000-0001",
      correo: "",
      direccion: "",
      responsable: null,
      contactoEmergencia: { nombre: "Contacto", telefono: "7000-0002" },
    }),
  );
  pacienteId = paciente.id;
});

afterAll(async () => {
  await Promise.all([app.end(), migrator.end(), db.$disconnect()]);
});

describe("crear diagnóstico", () => {
  it("registra multi-diente y multi-superficie con un solo diagnóstico", async () => {
    const diagnostico = await crearDiagnostico(ctxOdontologoA, {
      pacienteId,
      descripcion: "Caries profunda",
      notas: null,
      alcance: "DIENTE",
      dientes: [
        { fdi: 26, superficie: "MESIAL" },
        { fdi: 26, superficie: "OCLUSAL" },
        { fdi: 27, superficie: "COMPLETO" },
      ],
    });
    expect(diagnostico).not.toBeNull();
    expect(diagnostico!.dientes).toHaveLength(3);
    expect(diagnostico!.anulado).toBe(false);
  });

  it("un diagnóstico general del paciente vive sin filas de dientes", async () => {
    const diagnostico = await crearDiagnostico(ctxOdontologoA, {
      pacienteId,
      descripcion: "Bruxismo",
      notas: "Reporta dolor mandibular al despertar.",
      alcance: "PACIENTE",
      dientes: [],
    });
    expect(diagnostico!.dientes).toEqual([]);
  });

  it("la FK rechaza una cara que la pieza no tiene, aunque la app se salte Zod", async () => {
    await expect(
      conContexto({ clinicaId: clinicaA.clinicaId }, async (cliente) => {
        const dx = await cliente.query(
          `SELECT id FROM diagnosticos WHERE descripcion = 'Caries profunda' LIMIT 1`,
        );
        await cliente.query(
          `INSERT INTO diagnostico_dientes (id, clinica_id, diagnostico_id, fdi, superficie)
           VALUES ($1, $2, $3, 11, 'OCLUSAL')`,
          [randomUUID(), clinicaA.clinicaId, dx.rows[0].id],
        );
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("el personal administrativo no puede diagnosticar ni leer diagnósticos", async () => {
    await expect(
      crearDiagnostico(ctxAdministradorA, {
        pacienteId,
        descripcion: "Intento sin permiso clínico",
        notas: null,
        alcance: "PACIENTE",
        dientes: [],
      }),
    ).rejects.toThrow(/permiso/i);
    await expect(listarDiagnosticos(ctxAdministradorA, pacienteId)).rejects.toThrow(/permiso/i);
  });

  it("cross-tenant: la clínica B no ve ni alcanza al paciente de A", async () => {
    expect(await listarDiagnosticos(ctxOdontologoB, pacienteId)).toEqual([]);
    const resultado = await crearDiagnostico(ctxOdontologoB, {
      pacienteId,
      descripcion: "Intento cruzado",
      notas: null,
      alcance: "PACIENTE",
      dientes: [],
    });
    expect(resultado).toBeNull();
  });
});

describe("anulación", () => {
  it("anula con motivo y el diagnóstico sigue visible en la historia", async () => {
    const anulable = await crearDiagnostico(ctxOdontologoA, {
      pacienteId,
      descripcion: "Registrado por error",
      notas: null,
      alcance: "PACIENTE",
      dientes: [],
    });
    const anulado = await anularDiagnostico(ctxOdontologoA, {
      pacienteId,
      diagnosticoId: anulable!.id,
      motivoAnulacion: "Era del paciente de la cita anterior.",
    });
    expect(anulado!.anulado).toBe(true);
    expect(anulado!.motivoAnulacion).toContain("cita anterior");

    const historia = await listarDiagnosticos(ctxOdontologoA, pacienteId);
    expect(historia.some((dx) => dx.id === anulable!.id)).toBe(true);

    // La segunda anulación no encuentra un diagnóstico vigente.
    expect(
      await anularDiagnostico(ctxOdontologoA, {
        pacienteId,
        diagnosticoId: anulable!.id,
        motivoAnulacion: "Doble anulación.",
      }),
    ).toBeNull();
  });

  it("el CHECK rechaza una anulación a medias", async () => {
    await expect(
      conContexto({ clinicaId: clinicaA.clinicaId }, async (cliente) => {
        const dx = await cliente.query(
          `SELECT id FROM diagnosticos WHERE anulado_en IS NULL LIMIT 1`,
        );
        await cliente.query(
          `UPDATE diagnosticos SET anulado_en = CURRENT_TIMESTAMP WHERE id = $1`,
          [dx.rows[0].id],
        );
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("DELETE de un diagnóstico está negado por privilegio; el puente sí permite delete", async () => {
    await expect(
      conContexto({ clinicaId: clinicaA.clinicaId }, (cliente) =>
        cliente.query("DELETE FROM diagnosticos WHERE descripcion = 'Bruxismo'"),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      conContexto({ clinicaId: clinicaA.clinicaId }, (cliente) =>
        cliente.query("UPDATE diagnostico_dientes SET superficie = 'MESIAL'"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
