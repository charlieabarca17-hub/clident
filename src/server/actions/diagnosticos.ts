"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AnularDiagnosticoSchema,
  CrearDiagnosticoSchema,
} from "@/lib/validation/diagnosticos";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import { anularDiagnostico, crearDiagnostico } from "@/server/db/diagnosticos";

function texto(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

const MAX_FILAS_DIENTES = 10;

/** El formulario manda filas fijas pieza/superficie; las vacías no son dato. */
function dientesDelFormulario(formData: FormData) {
  const dientes: Array<{ fdi: string; superficie: string }> = [];
  for (let fila = 0; fila < MAX_FILAS_DIENTES; fila += 1) {
    const fdi = texto(formData, `diente-${fila}`);
    const superficie = texto(formData, `superficie-${fila}`);
    if (fdi) dientes.push({ fdi, superficie: superficie || "COMPLETO" });
  }
  return dientes;
}

export async function crearDiagnosticoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const datos = CrearDiagnosticoSchema.parse({
    pacienteId: texto(formData, "pacienteId"),
    descripcion: texto(formData, "descripcion"),
    notas: texto(formData, "notas"),
    alcance: texto(formData, "alcance"),
    dientes: dientesDelFormulario(formData),
  });
  const diagnostico = await crearDiagnostico(ctx, datos);
  if (!diagnostico) {
    redirect(`/pacientes/${datos.pacienteId}/diagnosticos?estado=paciente-no-disponible`);
  }
  revalidatePath(`/pacientes/${datos.pacienteId}/diagnosticos`);
  redirect(`/pacientes/${datos.pacienteId}/diagnosticos`);
}

export async function anularDiagnosticoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const datos = AnularDiagnosticoSchema.parse({
    pacienteId: texto(formData, "pacienteId"),
    diagnosticoId: texto(formData, "diagnosticoId"),
    motivoAnulacion: texto(formData, "motivoAnulacion"),
  });
  const diagnostico = await anularDiagnostico(ctx, datos);
  revalidatePath(`/pacientes/${datos.pacienteId}/diagnosticos`);
  redirect(
    diagnostico
      ? `/pacientes/${datos.pacienteId}/diagnosticos`
      : `/pacientes/${datos.pacienteId}/diagnosticos?estado=no-disponible`,
  );
}
