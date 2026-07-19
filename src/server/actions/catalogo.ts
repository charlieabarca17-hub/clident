"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { centavosDesdeTexto } from "@/lib/money";
import {
  ActualizarTratamientoSchema,
  CrearTratamientoSchema,
} from "@/lib/validation/catalogo";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import {
  actualizarTratamiento,
  clonarCatalogo,
  crearTratamiento,
} from "@/server/db/catalogo";

function texto(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

function bandera(formData: FormData, nombre: string): boolean {
  return formData.get(nombre) === "on";
}

/** El precio se captura como texto ("45.50") y money.ts lo convierte a centavos. */
function precioCentavos(formData: FormData, nombre: string): number | null {
  return centavosDesdeTexto(texto(formData, nombre));
}

export async function clonarCatalogoInicial(): Promise<void> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "catalogo:write");
  await clonarCatalogo(ctx);
  revalidatePath("/catalogo");
}

export async function crearTratamientoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "catalogo:write");
  const datos = CrearTratamientoSchema.parse({
    categoriaId: texto(formData, "categoriaId"),
    codigo: texto(formData, "codigo"),
    nombre: texto(formData, "nombre"),
    precioListaCentavos: precioCentavos(formData, "precio"),
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
    precioListaCentavos: precioCentavos(formData, "precio"),
    activo: bandera(formData, "activo"),
  });
  const tratamiento = await actualizarTratamiento(ctx, tratamientoId, datos);
  if (!tratamiento) {
    throw new Error("El tratamiento no existe.");
  }
  revalidatePath("/catalogo");
  redirect("/catalogo");
}
