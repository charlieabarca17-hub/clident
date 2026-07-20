"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AgregarReferenciaCatalogoSchema,
  ActualizarTratamientoSchema,
  CrearTratamientoSchema,
  PreferenciaTratamientoSchema,
} from "@/lib/validation/catalogo";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import {
  actualizarTratamiento,
  agregarReferenciaCatalogo,
  crearTratamiento,
  guardarPreferenciaTratamiento,
} from "@/server/db/catalogo";

function texto(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

function bandera(formData: FormData, nombre: string): boolean {
  return formData.get(nombre) === "on";
}

export async function agregarReferenciaDesdeFormulario(formData: FormData): Promise<void> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "catalogo:write");
  const datos = AgregarReferenciaCatalogoSchema.parse({ codigo: texto(formData, "codigo") });
  await agregarReferenciaCatalogo(ctx, datos.codigo);
  revalidatePath("/catalogo");
}

export async function crearTratamientoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "catalogo:write");
  const datos = CrearTratamientoSchema.parse({
    categoriaNombre: texto(formData, "categoriaNombre"),
    codigo: texto(formData, "codigo"),
    nombre: texto(formData, "nombre"),
    alcance: texto(formData, "alcance"),
    requiereDiente: bandera(formData, "requiereDiente"),
    permiteMultiplesDientes: bandera(formData, "permiteMultiplesDientes"),
    permiteSuperficies: bandera(formData, "permiteSuperficies"),
    permiteMultiplesSuperficies: bandera(formData, "permiteMultiplesSuperficies"),
    requiereDiagnostico: bandera(formData, "requiereDiagnostico"),
    permiteMultiplesSesiones: bandera(formData, "permiteMultiplesSesiones"),
  });
  await crearTratamiento(ctx, datos);
  revalidatePath("/catalogo");
  redirect("/catalogo");
}

export async function actualizarTratamientoDesdeFormulario(
  tratamientoId: string,
  formData: FormData,
): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "catalogo:write");
  const datos = ActualizarTratamientoSchema.parse({
    nombre: texto(formData, "nombre"),
    activo: bandera(formData, "activo"),
  });
  const tratamiento = await actualizarTratamiento(ctx, tratamientoId, datos);
  if (!tratamiento) {
    throw new Error("El tratamiento no existe.");
  }
  revalidatePath("/catalogo");
  redirect("/catalogo");
}

export async function guardarPreferenciaDesdeFormulario(
  tratamientoId: string,
  formData: FormData,
): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "catalogo:read");
  const datos = PreferenciaTratamientoSchema.parse({
    alias: texto(formData, "alias"),
    favorito: bandera(formData, "favorito"),
  });
  const tratamiento = await guardarPreferenciaTratamiento(ctx, tratamientoId, datos);
  if (!tratamiento) throw new Error("El tratamiento no existe.");
  revalidatePath("/catalogo");
  redirect("/catalogo");
}
