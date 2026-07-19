import { z } from "zod";

import { buscarDiente, SUPERFICIES } from "@/lib/dientes";

const DienteDiagnosticoSchema = z.object({
  fdi: z.coerce.number().int(),
  superficie: z.enum(SUPERFICIES),
});

export const CrearDiagnosticoSchema = z
  .object({
    pacienteId: z.string().trim().min(1),
    descripcion: z
      .string()
      .trim()
      .min(1, "La descripción del diagnóstico es obligatoria.")
      .max(300, "La descripción no puede pasar de 300 caracteres."),
    notas: z
      .string()
      .trim()
      .max(2000, "Las notas no pueden pasar de 2000 caracteres.")
      .optional()
      .nullable()
      .transform((valor) => valor || null),
    alcance: z.enum(["DIENTE", "PACIENTE"]),
    dientes: z.array(DienteDiagnosticoSchema).max(52),
  })
  .superRefine((datos, contexto) => {
    if (datos.alcance === "PACIENTE" && datos.dientes.length > 0) {
      contexto.addIssue({
        code: "custom",
        message: "Un diagnóstico general del paciente no lleva piezas: quitá las piezas o cambiá el alcance.",
      });
    }
    if (datos.alcance === "DIENTE" && datos.dientes.length === 0) {
      contexto.addIssue({
        code: "custom",
        message: "Un diagnóstico por pieza necesita al menos una pieza.",
      });
    }

    const vistos = new Set<string>();
    for (const diente of datos.dientes) {
      const referencia = buscarDiente(diente.fdi);
      if (!referencia) {
        contexto.addIssue({ code: "custom", message: `La pieza ${diente.fdi} no existe en notación FDI.` });
        continue;
      }
      // La FK a superficies_diente lo rechazaría igual; acá el mensaje es humano.
      if (!referencia.superficies.includes(diente.superficie)) {
        contexto.addIssue({
          code: "custom",
          message: `La pieza ${diente.fdi} no tiene la cara ${diente.superficie}.`,
        });
      }
      const clave = `${diente.fdi}:${diente.superficie}`;
      if (vistos.has(clave)) {
        contexto.addIssue({
          code: "custom",
          message: `La pieza ${diente.fdi} (${diente.superficie}) está repetida.`,
        });
      }
      vistos.add(clave);
    }
  });

export type CrearDiagnosticoInput = z.infer<typeof CrearDiagnosticoSchema>;

export const AnularDiagnosticoSchema = z.object({
  pacienteId: z.string().trim().min(1),
  diagnosticoId: z.string().trim().min(1),
  motivoAnulacion: z
    .string()
    .trim()
    .min(1, "El motivo de anulación es obligatorio.")
    .max(1000, "El motivo no puede pasar de 1000 caracteres."),
});

export type AnularDiagnosticoInput = z.infer<typeof AnularDiagnosticoSchema>;
