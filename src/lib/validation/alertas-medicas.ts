import { z } from "zod";

const textoRequerido = (maximo: number) => z.string().trim().min(1).max(maximo);
const textoOpcional = (maximo: number) =>
  z.string().trim().max(maximo).optional().nullable().transform((valor) => valor || null);

export const CrearAlertaMedicaSchema = z.object({
  pacienteId: textoRequerido(64),
  titulo: textoRequerido(160),
  detalle: textoOpcional(1_000),
});

export const DesactivarAlertaMedicaSchema = z.object({
  motivoDesactivacion: textoRequerido(1_000),
});

export type CrearAlertaMedicaInput = z.infer<typeof CrearAlertaMedicaSchema>;
export type DesactivarAlertaMedicaInput = z.infer<typeof DesactivarAlertaMedicaSchema>;
