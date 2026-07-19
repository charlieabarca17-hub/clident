import "server-only";

import type { TenantTransaction } from "../tenant";

/**
 * ¿Por qué SQL crudo? El contador de un cargo y su estado deben cambiar en UNA
 * SOLA sentencia atómica (`x = x + delta` + CASE), porque el CHECK
 * `cargo_estado_coherente` amarra estado y contador: dos sentencias separadas
 * dejarían un instante intermedio que el propio CHECK rechaza. Prisma puede
 * incrementar atómicamente, pero no puede escribir el CASE del estado en la
 * misma sentencia (§13.2).
 *
 * El UPDATE toma el lock de fila del cargo implícitamente; bajo READ COMMITTED
 * un UPDATE concurrente se bloquea y re-evalúa sobre el valor nuevo (§13.1).
 * Si el delta sobreaplica, el CHECK `cargo_no_sobreaplicado` truena con 23514.
 */
export async function aplicarMontoACargo(
  tx: TenantTransaction,
  params: { clinicaId: string; cargoId: string; deltaCentavos: number },
): Promise<number> {
  const filas = await tx.$executeRaw`
    UPDATE cargos SET
      monto_aplicado_centavos = monto_aplicado_centavos + ${params.deltaCentavos},
      estado = CASE
        WHEN monto_aplicado_centavos + ${params.deltaCentavos} = 0 THEN 'PENDIENTE'::"EstadoCargo"
        WHEN monto_aplicado_centavos + ${params.deltaCentavos} = monto_centavos THEN 'PAGADO'::"EstadoCargo"
        ELSE 'PARCIAL'::"EstadoCargo"
      END,
      actualizado_en = CURRENT_TIMESTAMP
    WHERE clinica_id = ${params.clinicaId} AND id = ${params.cargoId}
      AND anulado_en IS NULL
  `;
  return filas;
}
