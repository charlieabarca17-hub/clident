import "server-only";

import type { TenantTransaction } from "../tenant";

/**
 * ¿Por qué SQL crudo? Son AGREGADOS de dinero, y los agregados van como bigint
 * en SQL (ADR-009): `Int` topa en $21,474,836.47 y la suma de cuentas por
 * cobrar de una clínica entera lo pasa mucho antes que la de un paciente.
 *
 * Además salen de UNA pasada: seis consultas separadas podrían leer estados
 * distintos entre sí y mostrar un tablero internamente incoherente.
 *
 * ⚠ `cuentasPorCobrarCentavos` es el saldo EXIGIBLE, nunca el total cargado
 * (ADR-013): mostrar el total cargado como CxC es la versión por calendario
 * del error que el ADR-007 existe para impedir — cuentas por cobrar que
 * reflejan plata que nadie debe todavía.
 */
export type KpisDashboard = {
  citasHoy: number;
  citasPendientesHoy: number;
  pacientesActivos: number;
  ingresosHoyCentavos: bigint;
  cuentasPorCobrarCentavos: bigint;
  vencidoCentavos: bigint;
  tratamientosSinCargo: number;
  materialesBajoMinimo: number;
};

export async function kpisDelDia(
  tx: TenantTransaction,
  params: { clinicaId: string; hoy: string; inicioDia: Date; finDia: Date },
): Promise<KpisDashboard> {
  const filas = await tx.$queryRaw<
    Array<{
      citas_hoy: number;
      citas_pendientes_hoy: number;
      pacientes_activos: number;
      ingresos_hoy: bigint;
      cuentas_por_cobrar: bigint;
      vencido: bigint;
      tratamientos_sin_cargo: number;
      materiales_bajo_minimo: number;
    }>
  >`
    SELECT
      (SELECT count(*)::int FROM citas
        WHERE clinica_id = ${params.clinicaId}
          AND inicio_en >= ${params.inicioDia} AND inicio_en < ${params.finDia}) AS citas_hoy,
      (SELECT count(*)::int FROM citas
        WHERE clinica_id = ${params.clinicaId} AND estado = 'PENDIENTE'
          AND inicio_en >= ${params.inicioDia} AND inicio_en < ${params.finDia}) AS citas_pendientes_hoy,
      (SELECT count(*)::int FROM pacientes
        WHERE clinica_id = ${params.clinicaId}) AS pacientes_activos,
      -- Dinero que ENTRÓ hoy: pagos no anulados, sin importar si ya se aplicaron.
      (SELECT COALESCE(SUM(monto_centavos), 0)::bigint FROM pagos
        WHERE clinica_id = ${params.clinicaId} AND anulado_en IS NULL
          AND creado_en >= ${params.inicioDia} AND creado_en < ${params.finDia}) AS ingresos_hoy,
      -- EXIGIBLE. Nunca el total cargado (ADR-013).
      (SELECT COALESCE(SUM(monto_centavos - monto_aplicado_centavos), 0)::bigint FROM cargos
        WHERE clinica_id = ${params.clinicaId} AND anulado_en IS NULL
          AND fecha_exigible_en <= ${params.hoy}::date) AS cuentas_por_cobrar,
      (SELECT COALESCE(SUM(monto_centavos - monto_aplicado_centavos), 0)::bigint FROM cargos
        WHERE clinica_id = ${params.clinicaId} AND anulado_en IS NULL
          AND fecha_exigible_en < ${params.hoy}::date) AS vencido,
      -- ADR-017: una fila pendiente por tratamiento del plan, no por sesión.
      (SELECT count(*)::int FROM plan_items pi
        WHERE pi.clinica_id = ${params.clinicaId}
          AND pi.estado IN ('ACEPTADO', 'EN_PROCESO', 'COMPLETADO')
          AND pi.precio_unitario_centavos - pi.descuento_centavos > 0
          AND EXISTS (
            SELECT 1 FROM planes pl
             WHERE pl.clinica_id = pi.clinica_id AND pl.id = pi.plan_id
               AND pl.estado = 'ACEPTADO'
          )
          AND EXISTS (
            SELECT 1 FROM procedimientos p
             WHERE p.clinica_id = pi.clinica_id AND p.plan_item_id = pi.id
               AND p.estado = 'REALIZADO'
          )
          AND NOT EXISTS (
            SELECT 1 FROM cargos c
             WHERE c.clinica_id = pi.clinica_id AND c.plan_item_id = pi.id
               AND c.anulado_en IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM procedimientos p
             WHERE p.clinica_id = pi.clinica_id AND p.plan_item_id = pi.id
               AND p.estado = 'REALIZADO' AND p.cargo_id IS NOT NULL
          )) AS tratamientos_sin_cargo,
      (SELECT count(*)::int FROM materiales
        WHERE clinica_id = ${params.clinicaId} AND activo = true
          AND stock_actual <= stock_minimo) AS materiales_bajo_minimo
  `;
  const fila = filas[0];
  return {
    citasHoy: fila.citas_hoy,
    citasPendientesHoy: fila.citas_pendientes_hoy,
    pacientesActivos: fila.pacientes_activos,
    ingresosHoyCentavos: fila.ingresos_hoy,
    cuentasPorCobrarCentavos: fila.cuentas_por_cobrar,
    vencidoCentavos: fila.vencido,
    tratamientosSinCargo: fila.tratamientos_sin_cargo,
    materialesBajoMinimo: fila.materiales_bajo_minimo,
  };
}
