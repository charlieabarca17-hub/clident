import { z } from "zod";

import { MAX_CENTAVOS } from "@/lib/money";

const cantidadPositiva = z
  .number({ message: "La cantidad no es válida." })
  .int("La cantidad debe ser un número entero.")
  .min(1, "La cantidad debe ser mayor que cero.")
  .max(1_000_000, "La cantidad excede el máximo razonable.");

export const CrearMaterialSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  unidad: z.string().trim().min(1, "La unidad es obligatoria.").max(30),
  stockActual: z
    .number({ message: "El stock inicial no es válido." })
    .int()
    .min(0, "El stock no puede ser negativo.")
    .max(1_000_000),
  stockMinimo: z
    .number({ message: "El stock mínimo no es válido." })
    .int()
    .min(0, "El stock mínimo no puede ser negativo.")
    .max(1_000_000),
  costoUnitarioCentavos: z
    .number()
    .int()
    .min(0)
    .max(MAX_CENTAVOS)
    .optional()
    .nullable()
    .transform((valor) => valor ?? null),
});

export type CrearMaterialInput = z.infer<typeof CrearMaterialSchema>;

// El stock NO se edita a mano: se mueve con movimientos que dejan historia.
// Por eso este esquema no tiene stockActual.
export const ActualizarMaterialSchema = z.object({
  materialId: z.string().trim().min(1),
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  unidad: z.string().trim().min(1, "La unidad es obligatoria.").max(30),
  stockMinimo: z.number().int().min(0).max(1_000_000),
  costoUnitarioCentavos: z
    .number()
    .int()
    .min(0)
    .max(MAX_CENTAVOS)
    .optional()
    .nullable()
    .transform((valor) => valor ?? null),
  activo: z.boolean(),
});

export type ActualizarMaterialInput = z.infer<typeof ActualizarMaterialSchema>;

export const MovimientoInventarioSchema = z
  .object({
    materialId: z.string().trim().min(1),
    tipo: z.enum(["ENTRADA", "SALIDA", "AJUSTE"]),
    cantidad: cantidadPositiva,
    // Para AJUSTE, el signo lo decide esta bandera; el motivo es obligatorio.
    ajusteNegativo: z.boolean().default(false),
    motivo: z
      .string()
      .trim()
      .max(500, "El motivo no puede pasar de 500 caracteres.")
      .optional()
      .nullable()
      .transform((valor) => valor || null),
  })
  .superRefine((datos, contexto) => {
    if (datos.tipo === "AJUSTE" && !datos.motivo) {
      contexto.addIssue({
        code: "custom",
        message: "Un ajuste de inventario necesita motivo: un conteo físico se explica.",
      });
    }
  });

export type MovimientoInventarioInput = z.infer<typeof MovimientoInventarioSchema>;

/** El delta con signo que va al contador. SALIDA y ajuste negativo restan. */
export function deltaDeMovimiento(input: MovimientoInventarioInput): number {
  if (input.tipo === "ENTRADA") return input.cantidad;
  if (input.tipo === "SALIDA") return -input.cantidad;
  return input.ajusteNegativo ? -input.cantidad : input.cantidad;
}
