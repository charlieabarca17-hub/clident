import { z } from "zod";

import { MAX_CENTAVOS } from "@/lib/money";

const nombreTratamiento = z.string().trim().min(1, "El nombre es obligatorio.").max(120);
const precioCentavos = z
  .number({ message: "El precio no es un monto válido. Escribilo como 45 o 45.50." })
  .int("El precio debe llegar en centavos enteros (ADR-009).")
  .min(0, "El precio no puede ser negativo.")
  .max(MAX_CENTAVOS, "El precio excede el máximo del sistema.");

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
    categoriaId: z.string().trim().min(1, "Elegí una categoría."),
    codigo: z
      .string()
      .trim()
      .min(1, "El código es obligatorio.")
      .max(20, "El código no puede pasar de 20 caracteres.")
      .transform((valor) => valor.toUpperCase()),
    nombre: nombreTratamiento,
    precioListaCentavos: precioCentavos,
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
  precioListaCentavos: precioCentavos,
  activo: z.boolean(),
});

export type ActualizarTratamientoInput = z.infer<typeof ActualizarTratamientoSchema>;
