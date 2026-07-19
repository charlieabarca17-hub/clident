import { z } from "zod";

import { buscarDiente, SUPERFICIES } from "@/lib/dientes";
import { CONDICIONES } from "@/lib/odontograma";

export const RealizarProcedimientoSchema = z
  .object({
    pacienteId: z.string().trim().min(1),
    planItemId: z.string().trim().min(1, "Elegí el tratamiento del plan."),
    realizadoEn: z
      .string()
      .trim()
      .optional()
      .transform((valor) => (valor ? new Date(valor) : new Date()))
      .refine((fecha) => !Number.isNaN(fecha.getTime()), { message: "La fecha no es válida." })
      .refine((fecha) => fecha.getTime() <= Date.now() + 60_000, {
        message: "Un procedimiento no puede realizarse en el futuro.",
      }),
    notasClinicas: z
      .string()
      .trim()
      .max(5000, "La nota no puede pasar de 5000 caracteres.")
      .optional()
      .nullable()
      .transform((valor) => valor || null),
    // La condición con la que queda cada superficie tratada. La decide el
    // profesional — el software no la infiere del tratamiento (§10 de REGLAS).
    condicionResultante: z
      .enum(CONDICIONES)
      .optional()
      .nullable()
      .transform((valor) => valor ?? null),
    dientes: z
      .array(z.object({ fdi: z.coerce.number().int(), superficie: z.enum(SUPERFICIES) }))
      .max(52),
  })
  .superRefine((datos, contexto) => {
    if (datos.dientes.length > 0 && !datos.condicionResultante) {
      contexto.addIssue({
        code: "custom",
        message: "Indicá con qué condición queda la pieza tratada (ej. Obturación).",
      });
    }
    const vistos = new Set<string>();
    for (const diente of datos.dientes) {
      const referencia = buscarDiente(diente.fdi);
      if (!referencia) {
        contexto.addIssue({ code: "custom", message: `La pieza ${diente.fdi} no existe en notación FDI.` });
        continue;
      }
      if (!referencia.superficies.includes(diente.superficie)) {
        contexto.addIssue({ code: "custom", message: `La pieza ${diente.fdi} no tiene la cara ${diente.superficie}.` });
      }
      const clave = `${diente.fdi}:${diente.superficie}`;
      if (vistos.has(clave)) {
        contexto.addIssue({ code: "custom", message: `La pieza ${diente.fdi} (${diente.superficie}) está repetida.` });
      }
      vistos.add(clave);
    }
  });

export type RealizarProcedimientoInput = z.infer<typeof RealizarProcedimientoSchema>;

export const EditarNotaSchema = z.object({
  procedimientoId: z.string().trim().min(1),
  notasClinicas: z
    .string()
    .trim()
    .min(1, "La nota no puede quedar vacía.")
    .max(5000, "La nota no puede pasar de 5000 caracteres."),
});

export const EnmendarNotaSchema = z.object({
  procedimientoId: z.string().trim().min(1),
  textoNuevo: z
    .string()
    .trim()
    .min(1, "El texto de la enmienda es obligatorio.")
    .max(5000, "La enmienda no puede pasar de 5000 caracteres."),
  motivo: z
    .string()
    .trim()
    .min(1, "El motivo de la enmienda es obligatorio.")
    .max(1000, "El motivo no puede pasar de 1000 caracteres."),
});

export const AnularProcedimientoSchema = z.object({
  procedimientoId: z.string().trim().min(1),
  motivoAnulacion: z
    .string()
    .trim()
    .min(1, "El motivo de anulación es obligatorio.")
    .max(1000, "El motivo no puede pasar de 1000 caracteres."),
});
