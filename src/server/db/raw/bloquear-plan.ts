import type { TenantTransaction } from "../tenant";

/**
 * Agregar un tratamiento exige que el plan esté en BORRADOR, pero leer el estado
 * y después insertar abre una carrera: otra persona presenta el plan en medio y
 * el paciente termina "habiendo visto" un tratamiento que se agregó después.
 * `FOR UPDATE` serializa las dos operaciones sobre la misma fila del plan: quien
 * llega segundo espera y vuelve a leer el estado ya confirmado (§13). Lo toman
 * todas las operaciones que cambian un plan (agregar, presentar, aceptar,
 * rechazar, anular). Orden de bloqueo: primero el plan, después sus ítems; Caja
 * solo bloquea ítems, así que no se forma un ciclo.
 *
 * Es SQL crudo porque Prisma no expresa `SELECT ... FOR UPDATE`.
 */
export async function bloquearPlan(
  tx: TenantTransaction,
  params: { clinicaId: string; planId: string },
): Promise<boolean> {
  const filas = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM planes
    WHERE clinica_id = ${params.clinicaId}
      AND id = ${params.planId}
    FOR UPDATE
  `;
  return filas.length === 1;
}
