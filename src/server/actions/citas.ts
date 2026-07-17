"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ErrorAgendaSucursal, ErrorAgendaTraslape } from "@/lib/errors";
import { CrearCitaSchema, ReprogramarCitaSchema } from "@/lib/validation/citas";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import {
  cancelarCita as cancelarCitaEnDb,
  crearCita as crearCitaEnDb,
  reprogramarCita as reprogramarCitaEnDb,
} from "@/server/db/citas";

function datosFormulario(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

export async function crearCita(input: unknown) {
  const ctx = await requireCtx();
  requirePermiso(ctx, "agenda:write");
  const datos = CrearCitaSchema.parse(input);
  const cita = await crearCitaEnDb(ctx, datos);
  revalidatePath("/agenda");
  return cita;
}

export async function crearCitaDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "agenda:write");
  const datos = CrearCitaSchema.parse(datosFormulario(formData));
  try {
    await crearCitaEnDb(ctx, datos);
    revalidatePath("/agenda");
  } catch (error) {
    if (error instanceof ErrorAgendaTraslape) {
      redirect(`/agenda/nueva?fecha=${encodeURIComponent(datos.fecha)}&pacienteId=${encodeURIComponent(datos.pacienteId)}&error=traslape`);
    }
    if (error instanceof ErrorAgendaSucursal) {
      redirect(`/agenda/nueva?fecha=${encodeURIComponent(datos.fecha)}&pacienteId=${encodeURIComponent(datos.pacienteId)}&error=sucursal`);
    }
    throw error;
  }
  redirect(`/agenda?fecha=${encodeURIComponent(datos.fecha)}`);
}

export async function cancelarCitaDesdeFormulario(formData: FormData): Promise<void> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "agenda:write");
  const citaId = String(formData.get("citaId") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();
  if (!citaId) throw new Error("La cita es obligatoria.");
  await cancelarCitaEnDb(ctx, citaId);
  revalidatePath("/agenda");
  if (fecha) revalidatePath(`/agenda?fecha=${fecha}`);
}

export async function reprogramarCita(citaId: string, input: unknown) {
  const ctx = await requireCtx();
  requirePermiso(ctx, "agenda:write");
  const datos = ReprogramarCitaSchema.parse(input);
  const cita = await reprogramarCitaEnDb(ctx, citaId, datos);
  revalidatePath("/agenda");
  return cita;
}
