"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CrearAlertaMedicaSchema,
  DesactivarAlertaMedicaSchema,
} from "@/lib/validation/alertas-medicas";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import {
  crearAlertaMedica as crearAlertaMedicaEnDb,
  desactivarAlertaMedica as desactivarAlertaMedicaEnDb,
} from "@/server/db/alertas-medicas";

const texto = (formData: FormData, nombre: string) => String(formData.get(nombre) ?? "").trim();

export async function crearAlertaMedica(input: unknown) {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const datos = CrearAlertaMedicaSchema.parse(input);
  const alerta = await crearAlertaMedicaEnDb(ctx, datos);
  revalidatePath(`/pacientes/${datos.pacienteId}`);
  return alerta;
}

export async function crearAlertaMedicaDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const datos = CrearAlertaMedicaSchema.parse({
    pacienteId: texto(formData, "pacienteId"),
    titulo: texto(formData, "titulo"),
    detalle: texto(formData, "detalle"),
  });
  const alerta = await crearAlertaMedicaEnDb(ctx, datos);
  revalidatePath(`/pacientes/${datos.pacienteId}`);
  const ruta = `/pacientes/${encodeURIComponent(datos.pacienteId)}`;
  redirect(alerta ? ruta : `${ruta}?alerta=expediente-no-disponible`);
}

export async function desactivarAlertaMedicaDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const alertaId = texto(formData, "alertaId");
  if (!pacienteId || !alertaId) throw new Error("La alerta y el paciente son obligatorios.");
  const datos = DesactivarAlertaMedicaSchema.parse({
    motivoDesactivacion: texto(formData, "motivoDesactivacion"),
  });
  const desactivada = await desactivarAlertaMedicaEnDb(ctx, alertaId, datos);
  revalidatePath(`/pacientes/${pacienteId}`);
  const ruta = `/pacientes/${encodeURIComponent(pacienteId)}`;
  redirect(desactivada ? ruta : `${ruta}?alerta=no-disponible`);
}
