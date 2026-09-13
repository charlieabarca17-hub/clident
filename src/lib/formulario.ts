import type { ZodError } from "zod";

import { esErrorReglaClinica } from "@/lib/errors";

/**
 * Errores de formulario que vuelven a la pantalla, sin perder lo ya escrito.
 *
 * **El problema.** Las acciones clínicas hacían `Schema.parse()`, que lanza. Como
 * no existe ningún `error.tsx`, una fecha futura o una pieza inválida dejaban al
 * profesional en la pantalla genérica de Next, sin saber qué corregir y habiendo
 * perdido la nota clínica que acababa de escribir.
 *
 * **Dónde viajan los datos.** En el estado que devuelve la Server Action, o sea en
 * el cuerpo de la respuesta al POST. **Nunca en la URL** —una nota clínica en la
 * barra de direcciones queda en el historial del navegador, en el referer y en los
 * registros de cualquier proxy— **ni en logs**: acá no se registra el contenido.
 */

export type EstadoFormulario = {
  readonly estado: "inicial" | "error";
  /** Lo que se le muestra al profesional. Ya viene en español y sin tecnicismos. */
  readonly mensajes: readonly string[];
  /** Lo que había tecleado, para volver a pintarlo tal cual. */
  readonly valores: Readonly<Record<string, string>>;
};

export const ESTADO_INICIAL: EstadoFormulario = { estado: "inicial", mensajes: [], valores: {} };

/**
 * Lo que se muestra cuando el fallo NO es una regla clínica conocida.
 *
 * **Por qué no dice "volvé a intentarlo".** Una transacción garantiza que la
 * escritura es atómica, **no** que el profesional sepa si ocurrió. Si la base
 * confirmó el `COMMIT` y la respuesta se perdió en el camino —conexión caída,
 * tiempo agotado, la instancia serverless que muere— el hecho clínico **quedó
 * registrado** y acá igual se ve un error. Invitar a reintentar en ese estado es
 * invitar a duplicar un hecho clínico, y el odontograma es append-only: el
 * duplicado no se borra, se anula con motivo y queda a la vista para siempre.
 *
 * Tampoco se filtra el error real: un mensaje de PostgreSQL o un stack puede
 * revelar nombres de tabla, ids de otra clínica o la forma interna del sistema.
 */
export const MENSAJE_RESULTADO_INCIERTO =
  "No se pudo confirmar si quedó registrado. Antes de volver a intentarlo, revisá la historia del paciente: si ya aparece, no lo registrés de nuevo.";

/** Lo que se muestra cuando el repositorio devuelve `null` (no existe, o es de otra clínica). */
export const MENSAJE_NO_DISPONIBLE =
  "Ese dato ya no está disponible. Actualizá la página y volvé a intentarlo.";

/** Nombre legible de cada campo, para que el mensaje diga dónde mirar. */
const ETIQUETAS: Readonly<Record<string, string>> = {
  fdi: "Pieza",
  superficie: "Cara",
  condicion: "Condición",
  ocurridoEn: "Fecha del hallazgo",
  diagnosticoId: "Diagnóstico vinculado",
  planItemId: "Tratamiento del plan",
  realizadoEn: "Fecha y hora",
  notasClinicas: "Nota clínica",
  condicionResultante: "La pieza queda como",
  dientes: "Piezas tratadas",
};

/**
 * Convierte los problemas de Zod en mensajes para el profesional, sin repetidos y
 * en el orden en que aparecen los campos del formulario.
 */
export function mensajesDeError(error: ZodError): readonly string[] {
  const vistos = new Set<string>();
  for (const problema of error.issues) {
    const campo = problema.path.find((parte) => typeof parte === "string");
    const etiqueta = typeof campo === "string" ? ETIQUETAS[campo] : undefined;
    vistos.add(etiqueta ? `${etiqueta}: ${problema.message}` : problema.message);
  }
  return [...vistos];
}

/** Copia del formulario lo que se tecleó, para devolvérselo a la pantalla. */
export function valoresDelFormulario(
  formData: FormData,
  campos: readonly string[],
): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const campo of campos) {
    const valor = formData.get(campo);
    if (typeof valor === "string") valores[campo] = valor;
  }
  return valores;
}

export function errorDeFormulario(
  mensajes: readonly string[],
  valores: Readonly<Record<string, string>>,
): EstadoFormulario {
  return { estado: "error", mensajes, valores };
}

/**
 * Convierte lo que lanzó el repositorio en algo que el profesional pueda leer.
 *
 * - **Regla clínica** (`ErrorReglaClinica`): se lanza en las guardas, antes de
 *   escribir nada, así que se sabe con certeza que no quedó registrado. Se muestra
 *   el mensaje concreto y se puede corregir y volver a guardar sin riesgo.
 * - **Cualquier otra cosa**: no se sabe si quedó registrado. Mensaje único, sin
 *   detalles internos y sin invitar a reintentar a ciegas.
 */
export function errorAlGuardar(
  error: unknown,
  valores: Readonly<Record<string, string>>,
): EstadoFormulario {
  if (esErrorReglaClinica(error)) return errorDeFormulario([error.message], valores);
  return errorDeFormulario([MENSAJE_RESULTADO_INCIERTO], valores);
}
