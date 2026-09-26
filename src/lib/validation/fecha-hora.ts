import { z } from "zod";

import { FechaCivilSchema, HoraCivilSchema, fechaHoraElSalvador } from "@/lib/validation/citas";

/**
 * Lo que el personal teclea en un `<input type="datetime-local">`, interpretado
 * como hora de la clínica.
 *
 * **El defecto que este módulo existe para impedir.** Ese input manda
 * `"2026-06-01T09:30"` **sin zona horaria**, y `new Date()` sobre una cadena así
 * la interpreta como hora local *del servidor*. En Vercel el servidor corre en
 * UTC, así que las 9:30 de la mañana de San Salvador se guardaban como `09:30Z`
 * — seis horas antes del instante en que de verdad ocurrieron. El registro
 * clínico quedaba fechado mal, y como `Procedimiento.realizadoEn` es inmutable
 * (`ARQUITECTURA.md` §10.5), corregirlo después obliga a anular y recrear.
 *
 * **La regla de zona horaria no se repite acá.** Vive en `fechaHoraElSalvador`
 * (`@/lib/validation/citas`), que es el único lugar del proyecto que convierte
 * una hora civil salvadoreña en un instante. Este módulo solo parte el valor del
 * formulario en fecha y hora, y reusa esa función.
 */

/**
 * `YYYY-MM-DDTHH:mm` exacto. **Sin segundos, a propósito.**
 *
 * Los dos formularios clínicos usan `<input type="datetime-local">` sin `step`,
 * así que el navegador manda precisión de minutos. Una versión anterior de este
 * archivo aceptaba segundos opcionales y después convertía usando solo `HH:mm`:
 * `09:30:45` se guardaba como `09:30:00` **sin avisarle a nadie**, y `09:30:99`
 * —que no es una hora— también pasaba, porque el grupo opcional nunca se validó
 * como rango. Aceptar un valor para después recortarlo es mentirle a quien lo
 * escribió sobre lo que quedó guardado en el expediente.
 *
 * Si algún día un formulario necesita segundos, esto lo rechaza de forma ruidosa
 * y hay que decidir explícitamente qué precisión se guarda — que es el fallo
 * correcto, no uno silencioso.
 */
const FECHA_HORA_LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

/**
 * Convierte el valor de un `datetime-local` en el instante que representa en
 * El Salvador. Devuelve `null` si la forma es inválida, si la fecha civil no
 * existe (30 de febrero) o si la hora es imposible (25:00).
 */
export function instanteDesdeFechaHoraLocal(valor: string): Date | null {
  const partes = FECHA_HORA_LOCAL.exec(valor.trim());
  if (!partes) return null;

  const [, fecha, hora] = partes;
  if (!FechaCivilSchema.safeParse(fecha).success) return null;
  if (!HoraCivilSchema.safeParse(hora).success) return null;

  const instante = fechaHoraElSalvador(fecha, hora);
  return Number.isNaN(instante.getTime()) ? null : instante;
}

/**
 * El campo de fecha y hora de un formulario clínico.
 *
 * - **Vacío = ahora.** Registrar sin tocar el campo sigue fechando el hecho en
 *   el momento en que se registra.
 * - **Con valor = hora de El Salvador**, no del servidor.
 * - **Nunca en el futuro.** Se toleran 60 segundos para el desfase entre el
 *   reloj de quien teclea y el del servidor.
 *
 * Los mensajes los pone cada formulario: un hallazgo del odontograma y un
 * procedimiento realizado le hablan al mismo profesional de cosas distintas.
 */
export function fechaHoraClinicaSchema(mensajes: { invalida: string; futura: string }) {
  return z
    .string()
    .trim()
    .optional()
    .transform((valor, contexto) => {
      if (!valor) return new Date();
      const instante = instanteDesdeFechaHoraLocal(valor);
      if (instante === null) {
        contexto.addIssue({ code: "custom", message: mensajes.invalida });
        return z.NEVER;
      }
      return instante;
    })
    .refine((fecha) => fecha.getTime() <= Date.now() + 60_000, { message: mensajes.futura });
}
