import { z } from "zod";

const nombreTratamiento = z.string().trim().min(1, "El nombre es obligatorio.").max(120);
const nombreCategoria = z.string().trim().min(1, "La categoría es obligatoria.").max(80);

/**
 * Espejo del CHECK `tratamientos_banderas_coherentes`: la base tiene la última
 * palabra, pero acá el error llega con un mensaje entendible antes del INSERT.
 */
function banderasCoherentes(
  datos: {
    alcance: "DIENTE" | "BOCA";
    requiereDiente: boolean;
    permiteMultiplesDientes: boolean;
    permiteSuperficies: boolean;
    permiteMultiplesSuperficies: boolean;
  },
  contexto: z.RefinementCtx,
): void {
  if (datos.permiteMultiplesSuperficies && !datos.permiteSuperficies) {
    contexto.addIssue({
      code: "custom",
      message: "No se pueden permitir múltiples superficies sin permitir superficies.",
    });
  }
  if (datos.permiteSuperficies && !datos.requiereDiente) {
    contexto.addIssue({
      code: "custom",
      message: "Las superficies solo tienen sentido en un tratamiento que exige pieza.",
    });
  }
  if (datos.permiteMultiplesDientes && !datos.requiereDiente) {
    contexto.addIssue({
      code: "custom",
      message: "Permitir múltiples dientes exige que el tratamiento requiera pieza.",
    });
  }
  if (datos.alcance === "BOCA" && datos.requiereDiente) {
    contexto.addIssue({
      code: "custom",
      message: "Un tratamiento de boca completa no puede exigir una pieza.",
    });
  }
}

export const CrearTratamientoSchema = z
  .object({
    categoriaNombre: nombreCategoria,
    codigo: z
      .string()
      .trim()
      .min(1, "El código es obligatorio.")
      .max(20, "El código no puede pasar de 20 caracteres.")
      .transform((valor) => valor.toUpperCase()),
    nombre: nombreTratamiento,
    alcance: z.enum(["DIENTE", "BOCA"]),
    requiereDiente: z.boolean(),
    permiteMultiplesDientes: z.boolean(),
    permiteSuperficies: z.boolean(),
    permiteMultiplesSuperficies: z.boolean(),
    requiereDiagnostico: z.boolean(),
    permiteMultiplesSesiones: z.boolean(),
  })
  .superRefine(banderasCoherentes);

export type CrearTratamientoInput = z.infer<typeof CrearTratamientoSchema>;

// Las banderas y el código no se editan: definen la identidad clínica del
// tratamiento. Cambiar de comportamiento = crear un tratamiento nuevo y
// desactivar el anterior (mismo criterio que "desactivar, nunca borrar", §4.2).
export const ActualizarTratamientoSchema = z.object({
  nombre: nombreTratamiento,
  activo: z.boolean(),
});

export type ActualizarTratamientoInput = z.infer<typeof ActualizarTratamientoSchema>;

export const AgregarReferenciaCatalogoSchema = z.object({
  codigo: z.string().trim().min(1).max(20),
});

export const PreferenciaTratamientoSchema = z.object({
  alias: z.string().trim().max(120).transform((valor) => valor || null),
  favorito: z.boolean(),
});

export type PreferenciaTratamientoInput = z.infer<typeof PreferenciaTratamientoSchema>;
