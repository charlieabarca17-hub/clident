import { z } from "zod";

export const ZONA_HORARIA_CLINICA = "America/El_Salvador";

const FECHA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;
const HORA_CIVIL = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const textoOpcional = (maximo: number) =>
  z.string().trim().max(maximo).optional().nullable().transform((valor) => valor || null);

function fechaCivilValida(fecha: string): boolean {
  if (!FECHA_CIVIL.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const valor = new Date(Date.UTC(anio, mes - 1, dia));
  return valor.getUTCFullYear() === anio
    && valor.getUTCMonth() === mes - 1
    && valor.getUTCDate() === dia;
}

export const FechaCivilSchema = z.string().refine(fechaCivilValida, {
  message: "La fecha debe ser válida y tener formato AAAA-MM-DD.",
});

export const HoraCivilSchema = z.string().regex(HORA_CIVIL, {
  message: "La hora debe tener formato HH:mm.",
});

/** El Salvador no tiene horario de verano: la hora civil se convierte siempre con UTC-6. */
export function fechaHoraElSalvador(fecha: string, hora: string): Date {
  return new Date(`${fecha}T${hora}:00-06:00`);
}

export function fechaHoyElSalvador(ahora = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA_CLINICA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value;
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

const DatosHorarioSchema = z.object({
  fecha: FechaCivilSchema,
  hora: HoraCivilSchema,
  duracionMinutos: z.coerce.number().int().min(5).max(480),
}).transform(({ fecha, hora, duracionMinutos }) => {
  const inicioEn = fechaHoraElSalvador(fecha, hora);
  return {
    fecha,
    hora,
    duracionMinutos,
    inicioEn,
    finEn: new Date(inicioEn.getTime() + duracionMinutos * 60_000),
  };
});

export const CrearCitaSchema = z.object({
  pacienteId: z.string().trim().min(1).max(128),
  odontologoId: z.string().trim().min(1).max(128),
  motivo: textoOpcional(240),
  notasAdministrativas: textoOpcional(1_000),
}).and(DatosHorarioSchema);

export const ReprogramarCitaSchema = DatosHorarioSchema;

export type CrearCitaInput = z.infer<typeof CrearCitaSchema>;
export type ReprogramarCitaInput = z.infer<typeof ReprogramarCitaSchema>;
