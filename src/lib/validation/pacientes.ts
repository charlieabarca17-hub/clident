import { z } from "zod";

import { esFormatoDui, normalizarDui } from "@/lib/dui";

const ZONA_HORARIA_CLINICA = "America/El_Salvador";

const textoRequerido = (maximo: number) => z.string().trim().min(1).max(maximo);
const textoOpcional = (maximo: number) =>
  z.string().trim().max(maximo).optional().nullable().transform((valor) => valor || null);

function hoyEnElSalvador(): Date {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA_CLINICA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value;
  return new Date(Date.UTC(Number(valor("year")), Number(valor("month")) - 1, Number(valor("day"))));
}

/** La edad se calcula contra el día civil de la clínica, nunca contra UTC. */
export function esMenorDeEdad(fechaNacimiento: Date, hoy = hoyEnElSalvador()): boolean {
  const cumpleDieciocho = new Date(Date.UTC(
    fechaNacimiento.getUTCFullYear() + 18,
    fechaNacimiento.getUTCMonth(),
    fechaNacimiento.getUTCDate(),
  ));
  return cumpleDieciocho > hoy;
}

const ResponsableSchema = z.object({
  nombre: textoRequerido(160),
  tipoDocumento: z.enum(["DUI", "PASAPORTE", "CARNET_RESIDENTE"]),
  numeroDocumento: textoRequerido(80),
  telefono: textoRequerido(30),
  parentesco: textoRequerido(80),
});

const ContactoEmergenciaSchema = z.object({
  nombre: textoRequerido(160),
  telefono: textoRequerido(30),
});

export const CrearPacienteSchema = z.object({
  nombres: textoRequerido(120),
  apellidos: textoRequerido(120),
  fechaNacimiento: z.coerce.date().refine((fecha) => fecha <= hoyEnElSalvador(), {
    message: "La fecha de nacimiento no puede estar en el futuro.",
  }),
  dui: z.string().trim().optional().nullable()
    .transform((valor) => valor || null)
    .transform((valor) => valor === null ? null : normalizarDui(valor))
    .refine((valor) => valor === null || esFormatoDui(valor), {
      message: "El DUI debe tener 9 dígitos, con o sin guion.",
    }),
  telefono: textoRequerido(30),
  correo: textoOpcional(254).refine((valor) => valor === null || z.email().safeParse(valor).success, {
    message: "El correo no tiene un formato válido.",
  }),
  direccion: textoOpcional(500),
  responsable: ResponsableSchema.optional().nullable().transform((valor) => valor ?? null),
  contactoEmergencia: ContactoEmergenciaSchema,
}).superRefine((paciente, contexto) => {
  if (esMenorDeEdad(paciente.fechaNacimiento) && !paciente.responsable) {
    contexto.addIssue({
      code: "custom",
      path: ["responsable"],
      message: "Todo paciente menor de edad debe tener un responsable completo.",
    });
  }
});

export type CrearPacienteInput = z.infer<typeof CrearPacienteSchema>;
