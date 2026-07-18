/**
 * DUI — Documento Único de Identidad de El Salvador. Formato `########-#`.
 *
 * **Acá NO vive el enmascarado.** El DUI se enmascara en la base (columna generada
 * `dui_enmascarado`) y se expone por `src/server/dto/` (CLAUDE.md §11.4,
 * ARQUITECTURA.md §14). Enmascarar en la aplicación dejaría el texto plano a un
 * descuido de distancia: no podés filtrar lo que nunca trajiste.
 *
 * El DUI es **opcional**: un menor de edad no tiene (REGLAS-DE-NEGOCIO.md §5.5). Estas
 * funciones validan un DUI cuando el campo trae uno; el campo vacío lo resuelve el
 * esquema Zod, no esto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PENDIENTE: el dígito verificador. NO está implementado, y es a propósito.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * El DUI lleva un dígito verificador, y validarlo atajaría un dígito mal tecleado en
 * recepción. **No se implementa hasta tener evidencia oficial del RNPN del algoritmo.**
 *
 * El Ciclo 2 lo implementó con el algoritmo que se cita comúnmente (pesos de 9 a 2, y
 * `(10 − suma mod 10) mod 10`) y **se revirtió**: no había fuente oficial detrás, y sus
 * pruebas solo verificaban que el código coincidiera consigo mismo. Eso es circular —
 * afirma "el DUI es válido" con la misma confianza tenga o no razón.
 *
 * **Por qué importa que sea de verdad y no aproximado:** si el algoritmo está mal,
 * recepción no puede registrar pacientes con DUI legítimos. Es ruidoso, pero el arreglo
 * apurado a las 8 a.m. con la sala llena es "quitemos la validación", y ahí se pierde
 * también la del formato. Una validación aproximada de identidad es peor que ninguna:
 * rechaza a gente real y no atrapa nada que el formato no atrape ya.
 *
 * **Qué haría falta para cerrarlo:** el algoritmo publicado por el RNPN, o su
 * verificación contra un conjunto de DUI reales — que **no se van a usar para esto**: son
 * datos personales de terceros y no se meten en un repositorio ni en una suite de
 * pruebas para verificar una fórmula (decidido por el propietario, Ciclo 2).
 *
 * Mientras tanto: la base hace cumplir el **formato** vía `CHECK (dui ~ '^\d{8}-\d$')`.
 * Al capturar, Zod normaliza los nueve dígitos consecutivos a esa forma canónica y luego
 * valida el mismo formato. Es menos de lo que se puede validar, y es todo lo que hoy se
 * puede afirmar con fundamento.
 */

/** Espejo exacto del `CHECK` de la base (ARQUITECTURA.md §14). Solo forma. */
export const FORMATO_DUI = /^\d{8}-\d$/;

/**
 * Convierte los nueve dígitos escritos sin guion al formato que exige PostgreSQL.
 * Las demás entradas se conservan para que la validación posterior las rechace con
 * un mensaje claro, en lugar de intentar adivinar o corregir datos incompletos.
 */
export function normalizarDui(valor: string): string {
  return /^\d{9}$/.test(valor) ? `${valor.slice(0, 8)}-${valor.slice(8)}` : valor;
}

/**
 * ¿Tiene la forma `########-#`?
 *
 * **Esto NO dice que el DUI exista ni que su dígito verificador sea correcto** — dice
 * que tiene la forma de uno. Ver la nota de arriba antes de asumir lo contrario.
 */
export function esFormatoDui(valor: string): boolean {
  return FORMATO_DUI.test(valor);
}
