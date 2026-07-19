import { z } from "zod";

import { buscarDiente, SUPERFICIES } from "@/lib/dientes";
import { CONDICIONES } from "@/lib/odontograma";

export const RegistrarCondicionSchema = z
  .object({
    pacienteId: z.string().trim().min(1),
    fdi: z.coerce.number().int(),
    superficie: z.enum(SUPERFICIES),
    condicion: z.enum(CONDICIONES),
    // Vacío = ahora. Un valor permite registrar hallazgos retroactivos (una
    // radiografía de la semana pasada) sin mentir sobre cuándo ocurrieron.
    ocurridoEn: z
      .string()
      .trim()
      .optional()
      .transform((valor) => (valor ? new Date(valor) : new Date()))
      .refine((fecha) => !Number.isNaN(fecha.getTime()), {
        message: "La fecha del hallazgo no es válida.",
      })
      .refine((fecha) => fecha.getTime() <= Date.now() + 60_000, {
        message: "El hallazgo no puede estar en el futuro.",
      }),
    diagnosticoId: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((valor) => valor || null),
  })
  .superRefine((datos, contexto) => {
    const diente = buscarDiente(datos.fdi);
    if (!diente) {
      contexto.addIssue({ code: "custom", message: `La pieza ${datos.fdi} no existe en notación FDI.` });
      return;
    }
    if (!diente.superficies.includes(datos.superficie)) {
      contexto.addIssue({
        code: "custom",
        message: `La pieza ${datos.fdi} no tiene la cara ${datos.superficie}.`,
      });
    }
  });

export type RegistrarCondicionInput = z.infer<typeof RegistrarCondicionSchema>;

export const AnularEventoOdontogramaSchema = z.object({
  pacienteId: z.string().trim().min(1),
  eventoId: z.string().trim().min(1),
  motivoAnulacion: z
    .string()
    .trim()
    .min(1, "El motivo de anulación es obligatorio.")
    .max(1000, "El motivo no puede pasar de 1000 caracteres."),
});

export type AnularEventoOdontogramaInput = z.infer<typeof AnularEventoOdontogramaSchema>;
