import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CrearPacienteSchema } from "@/lib/validation/pacientes";
import type { TenantContext } from "@/server/auth/types";
import { db } from "@/server/db/client";
import {
  anularEventoOdontograma,
  getOdontograma,
  reconstruirOdontograma,
  registrarCondicion,
} from "@/server/db/odontograma";
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

let clinicaA: Bootstrap;
let clinicaB: Bootstrap;
let ctxA: TenantContext;
let ctxB: TenantContext;
let pacienteId: string;

function registrar(
  fdi: number,
  superficie: "COMPLETO" | "MESIAL" | "OCLUSAL",
  condicion: "SANO" | "CARIES" | "OBTURACION" | "SELLANTE",
  ocurridoEn?: string,
) {
  return registrarCondicion(ctxA, {
    pacienteId,
    fdi,
    superficie,
    condicion,
    ocurridoEn: ocurridoEn ? new Date(ocurridoEn) : new Date(),
    diagnosticoId: null,
  });
}

beforeAll(async () => {
  clinicaA = await crearClinica("Odontograma A", "odo-a@clident.test");
  clinicaB = await crearClinica("Odontograma B", "odo-b@clident.test");
  ctxA = {
    usuarioId: clinicaA.usuarioId,
    clinicaId: clinicaA.clinicaId,
    membresiaId: clinicaA.membresiaId,
    roles: ["ODONTOLOGO"],
  };
  ctxB = {
    usuarioId: clinicaB.usuarioId,
    clinicaId: clinicaB.clinicaId,
    membresiaId: clinicaB.membresiaId,
    roles: ["ODONTOLOGO"],
  };

  const paciente = await crearPaciente(
    { ...ctxA, roles: ["RECEPCION"] },
    CrearPacienteSchema.parse({
      nombres: "Paciente",
      apellidos: "Odontograma",
      fechaNacimiento: "1985-03-15",
      dui: "",
      telefono: "7100-0001",
      correo: "",
      direccion: "",
      responsable: null,
      contactoEmergencia: { nombre: "Contacto", telefono: "7100-0002" },
    }),
  );
  pacienteId = paciente.id;
});

afterAll(async () => {
  await Promise.all([app.end(), migrator.end(), db.$disconnect()]);
});

describe("camino en vivo", () => {
  it("registrar una condición proyecta el estado de la superficie", async () => {
    await registrar(26, "OCLUSAL", "CARIES", "2026-07-01T10:00:00-06:00");
    const odontograma = await getOdontograma(ctxA, pacienteId);
    const estado = odontograma!.estados.find((e) => e.fdi === 26 && e.superficie === "OCLUSAL");
    expect(estado?.condicion).toBe("CARIES");
  });

  it("un evento más nuevo actualiza; uno retroactivo NO pisa al más nuevo", async () => {
    await registrar(26, "OCLUSAL", "OBTURACION", "2026-07-10T10:00:00-06:00");
    let odontograma = await getOdontograma(ctxA, pacienteId);
    expect(
      odontograma!.estados.find((e) => e.fdi === 26 && e.superficie === "OCLUSAL")?.condicion,
    ).toBe("OBTURACION");

    // Hallazgo retroactivo: ocurrió antes del último. La proyección no cambia.
    await registrar(26, "OCLUSAL", "CARIES", "2026-06-15T10:00:00-06:00");
    odontograma = await getOdontograma(ctxA, pacienteId);
    expect(
      odontograma!.estados.find((e) => e.fdi === 26 && e.superficie === "OCLUSAL")?.condicion,
    ).toBe("OBTURACION");
  });

  it("anular el evento ganador recalcula: aparece el anterior, no 'anulada'", async () => {
    const odontograma = await getOdontograma(ctxA, pacienteId);
    const ganador = odontograma!.eventos.find(
      (e) => e.fdi === 26 && e.condicion === "OBTURACION" && !e.anulado,
    )!;
    await anularEventoOdontograma(ctxA, {
      pacienteId,
      eventoId: ganador.id,
      motivoAnulacion: "La obturación era del 27, no del 26.",
    });

    const trasAnular = await getOdontograma(ctxA, pacienteId);
    const estado = trasAnular!.estados.find((e) => e.fdi === 26 && e.superficie === "OCLUSAL");
    // El estado vuelve al último no anulado (la caries retroactiva del 15 de junio... no:
    // gana la caries del 1 de julio, que es la más reciente de las vigentes).
    expect(estado?.condicion).toBe("CARIES");

    // El evento anulado sigue en la historia, marcado.
    const historico = trasAnular!.eventos.find((e) => e.id === ganador.id);
    expect(historico?.anulado).toBe(true);
  });

  it("anular el único evento de una superficie borra su fila de proyección", async () => {
    const creado = await registrar(11, "COMPLETO", "SELLANTE", "2026-07-01T09:00:00-06:00");
    await anularEventoOdontograma(ctxA, {
      pacienteId,
      eventoId: creado!.id,
      motivoAnulacion: "Pieza equivocada.",
    });
    const odontograma = await getOdontograma(ctxA, pacienteId);
    expect(odontograma!.estados.find((e) => e.fdi === 11)).toBeUndefined();
  });

  it("la doble anulación no encuentra objetivo", async () => {
    const anulado = (await getOdontograma(ctxA, pacienteId))!.eventos.find((e) => e.anulado)!;
    expect(
      await anularEventoOdontograma(ctxA, {
        pacienteId,
        eventoId: anulado.id,
        motivoAnulacion: "Segundo intento.",
      }),
    ).toBeNull();
  });
});

describe("equivalencia entre caminos", () => {
  it("rebuild tras secuencia con retroactivo y anulación no cambia la proyección", async () => {
    // Secuencia adicional sobre otra superficie para engordar la historia.
    await registrar(36, "COMPLETO", "CARIES", "2026-05-01T10:00:00-06:00");
    await registrar(36, "COMPLETO", "OBTURACION", "2026-07-01T10:00:00-06:00");
    await registrar(36, "MESIAL", "CARIES", "2026-07-02T10:00:00-06:00");

    const antes = (await getOdontograma(ctxA, pacienteId))!.estados
      .map((e) => `${e.fdi}|${e.superficie}|${e.condicion}|${e.tratamientoPendiente}|${e.ultimoEventoEn}`)
      .sort();

    await reconstruirOdontograma(ctxA, pacienteId);

    const despues = (await getOdontograma(ctxA, pacienteId))!.estados
      .map((e) => `${e.fdi}|${e.superficie}|${e.condicion}|${e.tratamientoPendiente}|${e.ultimoEventoEn}`)
      .sort();

    // Si el camino en vivo y el reducer divergen, esto truena.
    expect(despues).toEqual(antes);
  });
});

describe("mecanismos de la base", () => {
  it("la historia clínica no admite UPDATE ni DELETE para la app", async () => {
    await expect(
      conContexto({ clinicaId: clinicaA.clinicaId }, (cliente) =>
        cliente.query("UPDATE eventos_odontograma SET condicion = 'SANO'"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      conContexto({ clinicaId: clinicaA.clinicaId }, (cliente) =>
        cliente.query("DELETE FROM eventos_odontograma"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("el CHECK rechaza un evento incoherente y la FK una cara imposible", async () => {
    // CONDICION_REGISTRADA sin condición.
    await expect(
      conContexto({ clinicaId: clinicaA.clinicaId }, (cliente) =>
        cliente.query(
          `INSERT INTO eventos_odontograma (id, clinica_id, paciente_id, fdi, superficie, tipo, ocurrido_en, registrado_por_id)
           VALUES ($1, $2, $3, 26, 'OCLUSAL', 'CONDICION_REGISTRADA', CURRENT_TIMESTAMP, $4)`,
          [randomUUID(), clinicaA.clinicaId, pacienteId, clinicaA.membresiaId],
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });

    // El incisivo 11 no tiene cara OCLUSAL.
    await expect(
      conContexto({ clinicaId: clinicaA.clinicaId }, (cliente) =>
        cliente.query(
          `INSERT INTO eventos_odontograma (id, clinica_id, paciente_id, fdi, superficie, tipo, condicion, ocurrido_en, registrado_por_id)
           VALUES ($1, $2, $3, 11, 'OCLUSAL', 'CONDICION_REGISTRADA', 'CARIES', CURRENT_TIMESTAMP, $4)`,
          [randomUUID(), clinicaA.clinicaId, pacienteId, clinicaA.membresiaId],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("cross-tenant: la clínica B no ve el odontograma del paciente de A", async () => {
    expect(await getOdontograma(ctxB, pacienteId)).toBeNull();
  });
});
