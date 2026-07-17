/**
 * Dinero en CLIDENT: centavos enteros. Siempre. (ADR-009, CLAUDE.md §12)
 *
 * Nunca `Float`, nunca `Decimal`. Los campos terminan en `Centavos`
 * (`precioUnitarioCentavos`, `montoCentavos`): si no termina en `Centavos`, no es dinero.
 *
 * **Este es el único archivo del proyecto que divide entre 100**, y solo para mostrar.
 * Si necesitás dividir entre 100 en otro lado, no lo hagás: llamá a `formatearUSD()`.
 *
 * ⚠ Los agregados (sumas de reportes) NO se hacen acá: se calculan como `bigint` en SQL.
 *   `Int` topa en $21,474,836.47 por fila, y una suma de reporte lo pasa fácil.
 */

/** El monto máximo que cabe en una columna `Int` de PostgreSQL: $21,474,836.47. */
export const MAX_CENTAVOS = 2_147_483_647;

function exigirCentavos(centavos: number, nombre = "centavos"): void {
  if (!Number.isInteger(centavos)) {
    throw new Error(
      `${nombre} debe ser un entero de centavos, y llegó ${centavos}. ` +
        `Si eso son dólares, multiplicá por 100 antes de llamar acá (ADR-009).`,
    );
  }
}

/**
 * Formatea centavos para mostrar. **La única división entre 100 del proyecto.**
 *
 * `123456` → `"$1,234.56"`
 */
export function formatearUSD(centavos: number): string {
  exigirCentavos(centavos);
  return new Intl.NumberFormat("es-SV", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centavos / 100);
}

/**
 * Aplica un porcentaje a un monto en centavos y devuelve centavos enteros.
 *
 * **Es el único lugar del proyecto donde se decide un redondeo de dinero.** Existe
 * porque los centavos enteros compran exactitud en sumas y restas, pero un porcentaje
 * (descuento, IVA 13% futuro) obliga a decidir qué pasa con la mitad de un centavo —
 * y esa decisión se toma una vez, acá, con prueba. (ADR-009)
 *
 * Redondeo: **half-up alejándose de cero**. `aplicarPorcentaje(105, 50)` → `53`, no `52`.
 * El signo se preserva, porque las reversas de `AplicacionPago` son montos negativos
 * (ARQUITECTURA.md §12.4).
 *
 * ⚠ Esto NO decide si el IVA va incluido o agregado, ni si se calcula sobre el total del
 *   cargo o línea por línea. Eso es la decisión pendiente #3 y no está tomada.
 */
export function aplicarPorcentaje(centavos: number, porcentaje: number): number {
  exigirCentavos(centavos);
  if (!Number.isFinite(porcentaje)) {
    throw new Error(`El porcentaje debe ser un número finito, y llegó ${porcentaje}.`);
  }

  const exacto = (centavos * porcentaje) / 100;
  const redondeado = Math.round(Math.abs(exacto)) * Math.sign(exacto);

  // `Math.sign(-0)` es `-0`; normalizar evita que un `-0` se serialice raro.
  return redondeado === 0 ? 0 : redondeado;
}
