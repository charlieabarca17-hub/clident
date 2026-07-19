import { z } from "zod";

import { buscarDiente, SUPERFICIES } from "@/lib/dientes";
import { MAX_CENTAVOS } from "@/lib/money";

const motivo = (mensaje: string) =>
  z.string().trim().min(1, mensaje).max(1000, "El motivo no puede pasar de 1000 caracteres.");

export const CrearPlanSchema = z.object({
  pacienteId: z.string().trim().min(1),
  titulo: z
    .string()
    .trim()
    .max(160, "El título no puede pasar de 160 caracteres.")
    .optional()
    .nullable()
    .transform((valor) => valor || null),
});

export type CrearPlanInput = z.infer<typeof CrearPlanSchema>;

// Este esquema valida FORMA. Las reglas que dependen de las banderas del
// catálogo (¿exige diagnóstico?, ¿permite superficies?) se validan en el
// SERVIDOR leyendo el tratamiento — nunca se confían del payload (§14.3).
export const AgregarPlanItemSchema = z
  .object({
    planId: z.string().trim().min(1),
    tratamientoId: z.string().trim().min(1, "Elegí un tratamiento."),
    diagnosticoId: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((valor) => valor || null),
    descuentoCentavos: z
      .number({ message: "El descuento no es un monto válido." })
      .int("El descuento debe llegar en centavos enteros (ADR-009).")
      .min(0, "El descuento no puede ser negativo.")
      .max(MAX_CENTAVOS)
      .default(0),
    dientes: z
      .array(z.object({ fdi: z.coerce.number().int(), superficie: z.enum(SUPERFICIES) }))
      .max(52),
  })
  .superRefine((datos, contexto) => {
    const vistos = new Set<string>();
    for (const diente of datos.dientes) {
      const referencia = buscarDiente(diente.fdi);
      if (!referencia) {
        contexto.addIssue({ code: "custom", message: `La pieza ${diente.fdi} no existe en notación FDI.` });
        continue;
      }
      if (!referencia.superficies.includes(diente.superficie)) {
        contexto.addIssue({
          code: "custom",
          message: `La pieza ${diente.fdi} no tiene la cara ${diente.superficie}.`,
        });
      }
      const clave = `${diente.fdi}:${diente.superficie}`;
      if (vistos.has(clave)) {
        contexto.addIssue({ code: "custom", message: `La pieza ${diente.fdi} (${diente.superficie}) está repetida.` });
      }
      vistos.add(clave);
    }
  });

export type AgregarPlanItemInput = z.infer<typeof AgregarPlanItemSchema>;

export const AceptarPlanSchema = z.object({
  planId: z.string().trim().min(1),
  // El usuario marca QUÉ tratamientos acepta el paciente — todos o algunos.
  // Alcance explícito, no cascada (§4.5): la lista viaja completa y la
  // auditoría los nombra a todos.
  itemIds: z.array(z.string().trim().min(1)).min(1, "Marcá al menos un tratamiento aceptado."),
});

export type AceptarPlanInput = z.infer<typeof AceptarPlanSchema>;

export const MotivoPlanSchema = z.object({
  planId: z.string().trim().min(1),
  motivo: motivo("El motivo es obligatorio."),
});

export const MotivoItemSchema = z.object({
  itemId: z.string().trim().min(1),
  motivo: motivo("El motivo es obligatorio."),
});
