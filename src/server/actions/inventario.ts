"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { centavosDesdeTexto } from "@/lib/money";
import {
  ActualizarMaterialSchema,
  CrearMaterialSchema,
  MovimientoInventarioSchema,
} from "@/lib/validation/inventario";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import {
  actualizarMaterial,
  crearMaterial,
  registrarMovimiento,
} from "@/server/db/inventario";

function texto(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

function entero(formData: FormData, nombre: string): number {
  const valor = texto(formData, nombre);
  return valor === "" ? Number.NaN : Number(valor);
}

function costo(formData: FormData): number | null {
  const valor = texto(formData, "costo");
  return valor ? centavosDesdeTexto(valor) : null;
}

export async function crearMaterialDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "inventario:write");
  const datos = CrearMaterialSchema.parse({
    nombre: texto(formData, "nombre"),
    unidad: texto(formData, "unidad"),
    stockActual: entero(formData, "stockActual"),
    stockMinimo: entero(formData, "stockMinimo"),
    costoUnitarioCentavos: costo(formData),
  });
  await crearMaterial(ctx, datos);
  revalidatePath("/inventario");
  redirect("/inventario");
}

export async function actualizarMaterialDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "inventario:write");
  const datos = ActualizarMaterialSchema.parse({
    materialId: texto(formData, "materialId"),
    nombre: texto(formData, "nombre"),
    unidad: texto(formData, "unidad"),
    stockMinimo: entero(formData, "stockMinimo"),
    costoUnitarioCentavos: costo(formData),
    activo: formData.get("activo") === "on",
  });
  const material = await actualizarMaterial(ctx, datos);
  revalidatePath("/inventario");
  redirect(material ? `/inventario/${datos.materialId}` : "/inventario?estado=no-disponible");
}

export async function registrarMovimientoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "inventario:write");
  const materialId = texto(formData, "materialId");
  const datos = MovimientoInventarioSchema.parse({
    materialId,
    tipo: texto(formData, "tipo"),
    cantidad: entero(formData, "cantidad"),
    ajusteNegativo: formData.get("ajusteNegativo") === "on",
    motivo: texto(formData, "motivo"),
  });
  const resultado = await registrarMovimiento(ctx, datos);
  revalidatePath(`/inventario/${materialId}`);
  redirect(
    resultado ? `/inventario/${materialId}` : `/inventario/${materialId}?estado=no-disponible`,
  );
}
