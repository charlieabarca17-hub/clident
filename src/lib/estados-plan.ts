/**
 * Transiciones de PlanTratamiento y PlanItem (ADR-014, REGLAS §4.5).
 *
 * "Solo estas transiciones son válidas. Todo lo demás se rechaza."
 *
 * Honestidad documentada: esto lo hace cumplir la APLICACIÓN con esta tabla y
 * su suite de pruebas — la base no puede (un CHECK es de fila y no ve el valor
 * anterior; no usamos triggers). Es la decisión pendiente #17 de ARQUITECTURA §19.
 */

export type EstadoPlan = "BORRADOR" | "PRESENTADO" | "ACEPTADO" | "RECHAZADO" | "ANULADO";
export type EstadoPlanItem =
  | "PROPUESTO"
  | "ACEPTADO"
  | "EN_PROCESO"
  | "COMPLETADO"
  | "CANCELADO"
  | "ANULADO";

// ACEPTADO → PRESENTADO no existe: un plan aceptado es un hecho con fecha, y
// devolverlo "para arreglarlo" reescribiría la prueba de la oferta. Un cambio
// material sobre un plan aceptado exige un plan NUEVO.
const TRANSICIONES_PLAN: Record<EstadoPlan, readonly EstadoPlan[]> = {
  BORRADOR: ["PRESENTADO", "ANULADO"],
  PRESENTADO: ["ACEPTADO", "RECHAZADO", "ANULADO"],
  ACEPTADO: ["ANULADO"],
  // RECHAZADO → ANULADO sí: si el plan se armó en el paciente equivocado, el
  // "dijo que no" es falso y anular con motivo es lo único cierto.
  RECHAZADO: ["ANULADO"],
  ANULADO: [],
};

// COMPLETADO → CANCELADO no existe: "cancelado" afirma que se interrumpió, y
// aplicárselo a algo terminado borraría historia clínica con un cambio de estado.
// COMPLETADO → ANULADO sí: un ítem puede marcarse completado por error sin
// ningún procedimiento detrás, y sin esta salida el expediente afirmaría para
// siempre un tratamiento que nunca ocurrió.
const TRANSICIONES_ITEM: Record<EstadoPlanItem, readonly EstadoPlanItem[]> = {
  PROPUESTO: ["ACEPTADO", "CANCELADO"],
  ACEPTADO: ["EN_PROCESO", "COMPLETADO", "CANCELADO"],
  EN_PROCESO: ["EN_PROCESO", "COMPLETADO", "CANCELADO"],
  COMPLETADO: ["ANULADO"],
  CANCELADO: [],
  ANULADO: [],
};

export function puedeTransicionarPlan(desde: EstadoPlan, hacia: EstadoPlan): boolean {
  return TRANSICIONES_PLAN[desde].includes(hacia);
}

export function puedeTransicionarItem(desde: EstadoPlanItem, hacia: EstadoPlanItem): boolean {
  return TRANSICIONES_ITEM[desde].includes(hacia);
}

/**
 * Regla de coherencia (§4.5): un ítem no puede salir de PROPUESTO hacia estados
 * clínicos si su plan no está ACEPTADO — sin esto, un tratamiento podría
 * ejecutarse bajo un plan que nunca se le presentó al paciente. La cancelación
 * es la excepción: descartar un ítem de un borrador es legítimo.
 */
export function itemRequierePlanAceptado(hacia: EstadoPlanItem): boolean {
  return hacia === "ACEPTADO" || hacia === "EN_PROCESO" || hacia === "COMPLETADO";
}
