import "server-only";

import type { TenantTransaction } from "../tenant";

/**
 * ¿Por qué SQL crudo? Los saldos son AGREGADOS y los agregados de dinero se
 * calculan como bigint en SQL (ADR-009): Int topa en $21,474,836.47 y una suma
 * lo pasa. Además los cuatro saldos de cargos salen de UNA pasada con FILTER
 * — cuatro consultas separadas podrían leer estados distintos entre sí.
 *
 * $hoy llega calculado desde src/lib/fechas.ts con America/El_Salvador
 * (ADR-013): calcularlo aquí con CURRENT_DATE usaría el huso de la sesión
 * (UTC en Neon) y movería los vencimientos seis horas.
 */
export type SaldosPaciente = {
  exigibleCentavos: bigint;
  vencidoCentavos: bigint;
  futuroCentavos: bigint;
  totalCargadoCentavos: bigint;
  creditoAFavorCentavos: bigint;
};

export async function saldosDePaciente(
  tx: TenantTransaction,
  params: { clinicaId: string; pacienteId: string; hoy: string },
): Promise<SaldosPaciente> {
  const filas = await tx.$queryRaw<
    Array<{
      exigible: bigint;
      vencido: bigint;
      futuro: bigint;
      total_cargado: bigint;
      credito: bigint;
    }>
  >`
    SELECT
      (SELECT COALESCE(SUM(monto_centavos - monto_aplicado_centavos), 0)::bigint
         FROM cargos
        WHERE clinica_id = ${params.clinicaId} AND paciente_id = ${params.pacienteId}
          AND anulado_en IS NULL AND fecha_exigible_en <= ${params.hoy}::date) AS exigible,
      (SELECT COALESCE(SUM(monto_centavos - monto_aplicado_centavos), 0)::bigint
         FROM cargos
        WHERE clinica_id = ${params.clinicaId} AND paciente_id = ${params.pacienteId}
          AND anulado_en IS NULL AND fecha_exigible_en < ${params.hoy}::date) AS vencido,
      (SELECT COALESCE(SUM(monto_centavos - monto_aplicado_centavos), 0)::bigint
         FROM cargos
        WHERE clinica_id = ${params.clinicaId} AND paciente_id = ${params.pacienteId}
          AND anulado_en IS NULL AND fecha_exigible_en > ${params.hoy}::date) AS futuro,
      (SELECT COALESCE(SUM(monto_centavos - monto_aplicado_centavos), 0)::bigint
         FROM cargos
        WHERE clinica_id = ${params.clinicaId} AND paciente_id = ${params.pacienteId}
          AND anulado_en IS NULL) AS total_cargado,
      (SELECT COALESCE(SUM(monto_centavos - monto_aplicado_centavos), 0)::bigint
         FROM pagos
        WHERE clinica_id = ${params.clinicaId} AND paciente_id = ${params.pacienteId}
          AND anulado_en IS NULL) AS credito
  `;
  const fila = filas[0];
  return {
    exigibleCentavos: fila.exigible,
    vencidoCentavos: fila.vencido,
    futuroCentavos: fila.futuro,
    totalCargadoCentavos: fila.total_cargado,
    creditoAFavorCentavos: fila.credito,
  };
}
