import "server-only";

import type { TenantTransaction } from "../tenant";

/**
 * ¿Por qué SQL crudo? Porque `saldoDespues` **sale del RETURNING**, nunca se
 * calcula en código (ARQUITECTURA §13.3). Prisma puede incrementar
 * atómicamente, pero no devuelve el valor resultante en la misma sentencia —
 * y leerlo después sería un read-modify-write: dos salidas concurrentes
 * escribirían el mismo saldo y el historial mentiría.
 *
 * El UPDATE toma el lock de fila del material. Si el delta deja el stock bajo
 * cero, el CHECK `material_stock_no_negativo` truena con 23514: el stock
 * negativo es imposible, no verificado.
 *
 * Devuelve null si el material no existe o está inactivo.
 */
export async function moverStock(
  tx: TenantTransaction,
  params: { clinicaId: string; materialId: string; delta: number },
): Promise<number | null> {
  const filas = await tx.$queryRaw<Array<{ stock_actual: number }>>`
    UPDATE materiales
       SET stock_actual = stock_actual + ${params.delta},
           actualizado_en = CURRENT_TIMESTAMP
     WHERE clinica_id = ${params.clinicaId}
       AND id = ${params.materialId}
       AND activo = true
    RETURNING stock_actual
  `;
  return filas.length === 1 ? filas[0].stock_actual : null;
}
