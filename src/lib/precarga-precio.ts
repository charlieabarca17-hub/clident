import { centavosDesdeTexto, usdEditable } from "@/lib/money";

/**
 * Qué muestra el campo de precio del plan al elegir un tratamiento (ADR-020).
 *
 * Vive fuera del componente para poder probarlo sin navegador: es la regla que
 * decide si un número aparece "solo", y un número que aparece solo es el que se
 * acepta sin pensar.
 *
 * - Si la persona ya escribió un precio, **no se toca**: lo que escribe manda (ADR-017).
 * - Si no, se precarga el habitual del tratamiento elegido.
 * - Si el elegido **no tiene** habitual (o no hay elegido), el campo queda **vacío**:
 *   dejar el número del tratamiento anterior guardaría un precio que nadie pensó.
 */
export function precioAlElegirTratamiento(
  precioActual: string,
  tocadoAMano: boolean,
  habitualCentavos: number | null | undefined,
): string {
  if (tocadoAMano) return precioActual;
  return habitualCentavos != null ? usdEditable(habitualCentavos) : "";
}

/**
 * ¿Avisar que la diferencia queda como tarifa preferencial? Solo si lo escrito es
 * un monto válido y MENOR que el habitual: "45" y "45.00" son el mismo precio, y
 * cobrar por encima no es un preferencial. Es un aviso; el servidor calcula el suyo.
 */
export function esPorDebajoDelHabitual(texto: string, habitualCentavos: number): boolean {
  const centavos = centavosDesdeTexto(texto);
  return centavos !== null && centavos < habitualCentavos;
}
