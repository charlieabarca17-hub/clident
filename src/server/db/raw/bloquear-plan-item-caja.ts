import type { TenantTransaction } from "../tenant";

/**
 * Caja debe decidir entre cobro único y cuotas mirando varias filas de Cargo.
 * El lock del PlanItem convierte esa decisión en una sola fila serializada:
 * dos cajeros no pueden elegir los dos caminos al mismo tiempo (ADR-017).
 */
export async function bloquearPlanItemParaCaja(
  tx: TenantTransaction,
  params: { clinicaId: string; planItemId: string },
): Promise<boolean> {
  const filas = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM plan_items
    WHERE clinica_id = ${params.clinicaId}
      AND id = ${params.planItemId}
    FOR UPDATE
  `;
  return filas.length === 1;
}
