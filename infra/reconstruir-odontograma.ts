// Regenera la proyección estados_superficie desde el log de eventos, para todas
// las clínicas. La proyección es derivada (ADR-005): si alguna vez se sospecha
// que divergió, este script la reconstruye desde la fuente de verdad.
//
// Usa la credencial de MIGRACIÓN porque recorre todas las clínicas; el camino
// normal de la aplicación es reconstruirOdontograma(ctx, pacienteId), que corre
// bajo RLS. El reducer es EL MISMO en ambos: src/lib/odontograma.ts.
//
// Uso: MIGRATION_DATABASE_URL=... npm run odontograma:rebuild

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
  reducirHistoriaSuperficie,
  type EventoOdontogramaReducible,
} from "../src/lib/odontograma.ts";

type FilaEvento = EventoOdontogramaReducible & {
  clinica_id: string;
  paciente_id: string;
  fdi: number;
  superficie: string;
};

export async function reconstruirProyeccionCompleta(connectionString: string): Promise<number> {
  const cliente = new pg.Client({ connectionString });
  await cliente.connect();

  try {
    await cliente.query("BEGIN");
    const eventos = await cliente.query(
      `SELECT id, clinica_id, paciente_id, fdi, superficie, tipo, condicion,
              ocurrido_en AS "ocurridoEn", creado_en AS "creadoEn",
              anula_evento_id AS "anulaEventoId"
       FROM eventos_odontograma`,
    );

    const porSuperficie = new Map<string, FilaEvento[]>();
    for (const fila of eventos.rows as FilaEvento[]) {
      const clave = `${fila.clinica_id}|${fila.paciente_id}|${fila.fdi}|${fila.superficie}`;
      const grupo = porSuperficie.get(clave) ?? [];
      grupo.push(fila);
      porSuperficie.set(clave, grupo);
    }

    await cliente.query("TRUNCATE TABLE estados_superficie");

    let proyectadas = 0;
    for (const grupo of porSuperficie.values()) {
      const estado = reducirHistoriaSuperficie(grupo);
      if (estado === null) continue;
      const { clinica_id, paciente_id, fdi, superficie } = grupo[0];
      await cliente.query(
        `INSERT INTO estados_superficie (
           id, clinica_id, paciente_id, fdi, superficie, condicion,
           tratamiento_pendiente, ultimo_evento_id, ultimo_evento_en,
           ultimo_evento_creado_en, actualizado_en
         ) VALUES ($1, $2, $3, $4, $5::"Superficie", $6::"CondicionDental", $7, $8, $9, $10, CURRENT_TIMESTAMP)`,
        [
          randomUUID(),
          clinica_id,
          paciente_id,
          fdi,
          superficie,
          estado.condicion,
          estado.tratamientoPendiente,
          estado.ultimoEventoId,
          estado.ultimoEventoEn,
          estado.ultimoEventoCreadoEn,
        ],
      );
      proyectadas += 1;
    }
    await cliente.query("COMMIT");
    return proyectadas;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL es obligatoria para reconstruir la proyección.");
  const total = await reconstruirProyeccionCompleta(url);
  console.log(`Proyección reconstruida: ${total} superficies.`);
}
