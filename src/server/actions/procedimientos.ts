"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AnularProcedimientoSchema,
  EditarNotaSchema,
  EnmendarNotaSchema,
  RealizarProcedimientoSchema,
} from "@/lib/validation/procedimientos";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import {
  anularProcedimiento,
  editarNotaClinica,
  enmendarNotaClinica,
  realizarProcedimiento,
} from "@/server/db/procedimientos";

function texto(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

const MAX_FILAS_DIENTES = 10;

function dientesDelFormulario(formData: FormData) {
  const dientes: Array<{ fdi: string; superficie: string }> = [];
  for (let fila = 0; fila < MAX_FILAS_DIENTES; fila += 1) {
    const fdi = texto(formData, `diente-${fila}`);
    const superficie = texto(formData, `superficie-${fila}`);
    if (fdi) dientes.push({ fdi, superficie: superficie || "COMPLETO" });
  }
  return dientes;
}

function ruta(pacienteId: string): string {
  return `/pacientes/${pacienteId}/procedimientos`;
}

export async function realizarProcedimientoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const datos = RealizarProcedimientoSchema.parse({
    pacienteId: texto(formData, "pacienteId"),
    planItemId: texto(formData, "planItemId"),
    realizadoEn: texto(formData, "realizadoEn"),
    notasClinicas: texto(formData, "notasClinicas"),
    condicionResultante: texto(formData, "condicionResultante") || null,
    dientes: dientesDelFormulario(formData),
  });
  const procedimiento = await realizarProcedimiento(ctx, datos);
  revalidatePath(ruta(datos.pacienteId));
  redirect(
    procedimiento
      ? ruta(datos.pacienteId)
      : `${ruta(datos.pacienteId)}?estado=no-disponible`,
  );
}

export async function editarNotaDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = EditarNotaSchema.parse({
    procedimientoId: texto(formData, "procedimientoId"),
    notasClinicas: texto(formData, "notasClinicas"),
  });
  const procedimiento = await editarNotaClinica(ctx, datos.procedimientoId, datos.notasClinicas);
  revalidatePath(ruta(pacienteId));
  redirect(procedimiento ? ruta(pacienteId) : `${ruta(pacienteId)}?estado=no-disponible`);
}

export async function enmendarNotaDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = EnmendarNotaSchema.parse({
    procedimientoId: texto(formData, "procedimientoId"),
    textoNuevo: texto(formData, "textoNuevo"),
    motivo: texto(formData, "motivo"),
  });
  const procedimiento = await enmendarNotaClinica(ctx, datos);
  revalidatePath(ruta(pacienteId));
  redirect(procedimiento ? ruta(pacienteId) : `${ruta(pacienteId)}?estado=no-disponible`);
}

export async function anularProcedimientoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = AnularProcedimientoSchema.parse({
    procedimientoId: texto(formData, "procedimientoId"),
    motivoAnulacion: texto(formData, "motivoAnulacion"),
  });
  const procedimiento = await anularProcedimiento(
    ctx,
    datos.procedimientoId,
    datos.motivoAnulacion,
  );
  revalidatePath(ruta(pacienteId));
  redirect(procedimiento ? ruta(pacienteId) : `${ruta(pacienteId)}?estado=no-disponible`);
}
