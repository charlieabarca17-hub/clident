// Reconciliación de contadores (ARQUITECTURA §13.4): los contadores son
// derivados y pueden derivar. Estas consultas DEBEN devolver cero filas.
//
// Corre con clident_migrator, NUNCA con clident_app: sin contexto de clínica,
// RLS le daría cero filas a la app y "todo cuadra" sería indistinguible de
// "no vi nada". El migrador reconcilia todas las clínicas a la vez (ADR-015).
//
// Uso: MIGRATION_DATABASE_URL=... npm run reconciliar

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

type Consulta = { nombre: string; sql: string };

export const CONSULTAS_RECONCILIACION: readonly Consulta[] = [
  {
    nombre: "#1 contador de cargos vs Σ aplicaciones",
    sql: `SELECT c.id, c.monto_aplicado_centavos, COALESCE(SUM(a.monto_centavos), 0) AS suma_real
          FROM cargos c
          LEFT JOIN aplicaciones_pago a ON a.cargo_id = c.id
          GROUP BY c.id, c.monto_aplicado_centavos
          HAVING c.monto_aplicado_centavos <> COALESCE(SUM(a.monto_centavos), 0)`,
  },
  {
    nombre: "#2 contador de pagos vs Σ aplicaciones",
    sql: `SELECT p.id, p.monto_aplicado_centavos, COALESCE(SUM(a.monto_centavos), 0) AS suma_real
          FROM pagos p
          LEFT JOIN aplicaciones_pago a ON a.pago_id = p.id
          GROUP BY p.id, p.monto_aplicado_centavos
          HAVING p.monto_aplicado_centavos <> COALESCE(SUM(a.monto_centavos), 0)`,
  },
  {
    nombre: "#4 monto del cargo vs Σ líneas (ADR-016: todo cargo tiene líneas)",
    sql: `SELECT c.id, c.monto_centavos, COALESCE(SUM(l.monto_centavos), 0) AS suma_lineas
          FROM cargos c
          LEFT JOIN lineas_cargo l ON l.cargo_id = c.id
          GROUP BY c.id, c.monto_centavos
          HAVING c.monto_centavos <> COALESCE(SUM(l.monto_centavos), 0)`,
  },
  {
    nombre: "#3 stock de materiales vs Σ movimientos",
    sql: `SELECT m.id, m.stock_actual, COALESCE(SUM(mv.cantidad), 0) AS suma_real
          FROM materiales m
          LEFT JOIN movimientos_inventario mv ON mv.material_id = m.id
          GROUP BY m.id, m.stock_actual
          HAVING m.stock_actual <> COALESCE(SUM(mv.cantidad), 0)`,
  },
  {
    nombre: "#5 resurrecciones (ADR-016 #12): anulado en auditoría pero vivo",
    sql: `SELECT au.entidad_id, au.accion
          FROM auditoria au
          WHERE au.accion = 'CARGO_ANULADO'
            AND EXISTS (SELECT 1 FROM cargos c WHERE c.id = au.entidad_id AND c.anulado_en IS NULL)
          UNION ALL
          SELECT au.entidad_id, au.accion
          FROM auditoria au
          WHERE au.accion = 'PAGO_ANULADO'
            AND EXISTS (SELECT 1 FROM pagos p WHERE p.id = au.entidad_id AND p.anulado_en IS NULL)`,
  },
];

export async function reconciliar(connectionString: string): Promise<
  Array<{ nombre: string; filas: number }>
> {
  const cliente = new pg.Client({ connectionString });
  await cliente.connect();
  try {
    // Guarda obligatoria: un chequeo que puede pasar por vacío tiene que
    // demostrar que no está vacío (§13.4).
    const totales = await cliente.query(
      "SELECT (SELECT count(*)::int FROM cargos) AS cargos, (SELECT count(*)::int FROM pagos) AS pagos",
    );
    const resultados: Array<{ nombre: string; filas: number }> = [
      {
        nombre: "guarda: hay filas que mirar",
        filas: totales.rows[0].cargos > 0 || totales.rows[0].pagos > 0 ? 0 : 1,
      },
    ];
    for (const consulta of CONSULTAS_RECONCILIACION) {
      const resultado = await cliente.query(consulta.sql);
      resultados.push({ nombre: consulta.nombre, filas: resultado.rowCount ?? 0 });
    }
    return resultados;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL es obligatoria para reconciliar.");
  const resultados = await reconciliar(url);
  let fallas = 0;
  for (const { nombre, filas } of resultados) {
    console.log(`${filas === 0 ? "✔" : "✘"} ${nombre}: ${filas} fila(s)`);
    if (filas > 0) fallas += 1;
  }
  if (fallas > 0) {
    console.error("HAY PLATA MAL CONTADA: revisá las consultas que devolvieron filas.");
    process.exit(1);
  }
  console.log("Todo cuadra.");
}
