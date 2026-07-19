import { z } from "zod";

import { MAX_CENTAVOS } from "@/lib/money";

const fechaCivil = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato AAAA-MM-DD.");

const centavos = (mensaje: string) =>
  z.number({ message: mensaje }).int(mensaje).min(0).max(MAX_CENTAVOS);

const motivo = z
  .string()
  .trim()
  .min(1, "El motivo es obligatorio.")
  .max(1000, "El motivo no puede pasar de 1000 caracteres.");

const LineaSchema = z
  .object({
    procedimientoId: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((valor) => valor || null),
    descripcion: z.string().trim().max(300).optional().nullable().transform((v) => v || null),
    precioOriginalCentavos: centavos("El precio no es un monto válido."),
    descuentoCentavos: centavos("El descuento no es un monto válido.").default(0),
  })
  .superRefine((linea, contexto) => {
    if (!linea.procedimientoId && !linea.descripcion) {
      contexto.addIssue({
        code: "custom",
        message: "Una línea sin procedimiento necesita descripción.",
      });
    }
    if (linea.descuentoCentavos > linea.precioOriginalCentavos) {
      contexto.addIssue({
        code: "custom",
        message: "El descuento no puede superar el precio original.",
      });
    }
  });

export const CrearCargoSchema = z
  .object({
    pacienteId: z.string().trim().min(1),
    descripcion: z.string().trim().min(1, "La descripción es obligatoria.").max(300),
    fechaExigibleEn: fechaCivil,
    lineas: z.array(LineaSchema).min(1, "Un cargo lleva al menos una línea."),
  })
  .superRefine((datos, contexto) => {
    const total = datos.lineas.reduce(
      (suma, linea) => suma + (linea.precioOriginalCentavos - linea.descuentoCentavos),
      0,
    );
    if (total <= 0) {
      contexto.addIssue({ code: "custom", message: "El monto total del cargo debe ser mayor que cero." });
    }
    if (total > MAX_CENTAVOS) {
      contexto.addIssue({ code: "custom", message: "El monto total excede el máximo del sistema." });
    }
  });

export type CrearCargoInput = z.infer<typeof CrearCargoSchema>;

export const CrearCalendarioCuotasSchema = z.object({
  pacienteId: z.string().trim().min(1),
  planItemId: z.string().trim().min(1, "Elegí el tratamiento del plan."),
  montoCuotaCentavos: z
    .number({ message: "El monto de la cuota no es válido." })
    .int()
    .min(1, "La cuota debe ser mayor que cero.")
    .max(MAX_CENTAVOS),
  // Las fechas llegan TODAS, explícitas y confirmadas por el usuario (#19):
  // el servidor no inventa ninguna.
  fechas: z.array(fechaCivil).min(1, "El calendario necesita al menos una cuota.").max(120),
});

export type CrearCalendarioCuotasInput = z.infer<typeof CrearCalendarioCuotasSchema>;

export const RegistrarPagoSchema = z.object({
  pacienteId: z.string().trim().min(1),
  montoCentavos: z
    .number({ message: "El monto no es válido." })
    .int()
    .min(1, "El pago debe ser mayor que cero.")
    .max(MAX_CENTAVOS),
  metodo: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "CHEQUE", "OTRO"]),
  referencia: z.string().trim().max(120).optional().nullable().transform((v) => v || null),
});

export type RegistrarPagoInput = z.infer<typeof RegistrarPagoSchema>;

export const AplicarPagoSchema = z.object({
  pagoId: z.string().trim().min(1, "Elegí el pago a aplicar."),
  cargoId: z.string().trim().min(1),
  montoCentavos: z
    .number({ message: "El monto a aplicar no es válido." })
    .int()
    .min(1, "El monto a aplicar debe ser mayor que cero.")
    .max(MAX_CENTAVOS),
});

export type AplicarPagoInput = z.infer<typeof AplicarPagoSchema>;

export const ReversarAplicacionSchema = z.object({
  aplicacionId: z.string().trim().min(1),
  motivo,
});

export const AnularConMotivoSchema = z.object({
  id: z.string().trim().min(1),
  motivo,
});
