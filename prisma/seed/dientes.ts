import pg from "pg";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DIENTES } from "../../src/lib/dientes.ts";

export async function sembrarDientes(connectionString: string): Promise<void> {
  const cliente = new pg.Client({ connectionString });
  await cliente.connect();

  try {
    await cliente.query("BEGIN");
    await cliente.query(
      `INSERT INTO dientes_ref (fdi, denticion, tipo, cuadrante, posicion, nombre)
       SELECT fdi, denticion::"Denticion", tipo::"TipoDiente", cuadrante, posicion, nombre
       FROM jsonb_to_recordset($1::jsonb) AS diente(
         fdi integer, denticion text, tipo text, cuadrante integer, posicion integer, nombre text
       )
       ON CONFLICT (fdi) DO UPDATE SET
         denticion = EXCLUDED.denticion, tipo = EXCLUDED.tipo,
         cuadrante = EXCLUDED.cuadrante, posicion = EXCLUDED.posicion,
         nombre = EXCLUDED.nombre`,
      [
        JSON.stringify(
          DIENTES.map(({ fdi, denticion, tipo, cuadrante, posicion, nombre }) => ({
            fdi,
            denticion,
            tipo,
            cuadrante,
            posicion,
            nombre,
          })),
        ),
      ],
    );
    const superficies = DIENTES.flatMap((diente) =>
      diente.superficies.map((superficie) => ({ fdi: diente.fdi, superficie })),
    );
    await cliente.query(
      `INSERT INTO superficies_diente (fdi, superficie)
       SELECT fdi, superficie::"Superficie"
       FROM jsonb_to_recordset($1::jsonb) AS cara(fdi integer, superficie text)
       ON CONFLICT (fdi, superficie) DO NOTHING`,
      [JSON.stringify(superficies)],
    );
    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL es obligatoria para sembrar dientes.");
  await sembrarDientes(url);
}
