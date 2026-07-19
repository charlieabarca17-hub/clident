"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { centavosDesdeTexto } from "@/lib/money";
import {
  AnularConMotivoSchema,
  AplicarPagoSchema,
  CrearCalendarioCuotasSchema,
  CrearCargoSchema,
  RegistrarPagoSchema,
  ReversarAplicacionSchema,
} from "@/lib/validation/caja";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import {
  anularCargo,
  anularPago,
  aplicarPago,
  crearCalendarioCuotas,
  crearCargo,
  registrarPago,
  reversarAplicacion,
} from "@/server/db/caja";

function texto(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

function ruta(pacienteId: string): string {
  return `/caja/${pacienteId}`;
}

function volver(pacienteId: string, ok: boolean): never {
  revalidatePath(ruta(pacienteId));
  redirect(ok ? ruta(pacienteId) : `${ruta(pacienteId)}?estado=no-disponible`);
}

/** Cobra procedimientos realizados: una línea por procedimiento marcado. */
export async function crearCargoDesdeProcedimientos(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "caja:write");
  const pacienteId = texto(formData, "pacienteId");
  const procedimientos = formData.getAll("procedimientoIds").map(String).filter(Boolean);

  const lineas = procedimientos.map((procedimientoId) => {
    const precio = centavosDesdeTexto(texto(formData, `precio-${procedimientoId}`));
    const descuentoTexto = texto(formData, `descuento-${procedimientoId}`);
    return {
      procedimientoId,
      descripcion: null,
      precioOriginalCentavos: precio,
      descuentoCentavos: descuentoTexto ? centavosDesdeTexto(descuentoTexto) : 0,
    };
  });
  const datos = CrearCargoSchema.parse({
    pacienteId,
    descripcion: texto(formData, "descripcion") || "Cobro de procedimientos",
    fechaExigibleEn: texto(formData, "fechaExigibleEn"),
    lineas,
  });
  const cargo = await crearCargo(ctx, datos);
  volver(pacienteId, cargo !== null);
}

export async function crearCargoLibre(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "caja:write");
  const pacienteId = texto(formData, "pacienteId");
  const descuentoTexto = texto(formData, "descuento");
  const datos = CrearCargoSchema.parse({
    pacienteId,
    descripcion: texto(formData, "descripcion"),
    fechaExigibleEn: texto(formData, "fechaExigibleEn"),
    lineas: [
      {
        procedimientoId: null,
        descripcion: texto(formData, "descripcion"),
        precioOriginalCentavos: centavosDesdeTexto(texto(formData, "precio")),
        descuentoCentavos: descuentoTexto ? centavosDesdeTexto(descuentoTexto) : 0,
      },
    ],
  });
  const cargo = await crearCargo(ctx, datos);
  volver(pacienteId, cargo !== null);
}

/** Las fechas llegan explícitas desde la pantalla de confirmación (#19). */
export async function confirmarCalendarioCuotas(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "caja:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = CrearCalendarioCuotasSchema.parse({
    pacienteId,
    planItemId: texto(formData, "planItemId"),
    montoCuotaCentavos: centavosDesdeTexto(texto(formData, "montoCuota")),
    fechas: formData.getAll("fechas").map(String),
  });
  await crearCalendarioCuotas(ctx, datos);
  volver(pacienteId, true);
}

export async function registrarPagoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "caja:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = RegistrarPagoSchema.parse({
    pacienteId,
    montoCentavos: centavosDesdeTexto(texto(formData, "monto")),
    metodo: texto(formData, "metodo"),
    referencia: texto(formData, "referencia"),
  });
  const pago = await registrarPago(ctx, datos);
  volver(pacienteId, pago !== null);
}

export async function aplicarPagoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "caja:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = AplicarPagoSchema.parse({
    pagoId: texto(formData, "pagoId"),
    cargoId: texto(formData, "cargoId"),
    montoCentavos: centavosDesdeTexto(texto(formData, "monto")),
  });
  const resultado = await aplicarPago(ctx, datos);
  volver(pacienteId, resultado !== null);
}

export async function reversarAplicacionDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "caja:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = ReversarAplicacionSchema.parse({
    aplicacionId: texto(formData, "aplicacionId"),
    motivo: texto(formData, "motivo"),
  });
  const resultado = await reversarAplicacion(ctx, datos.aplicacionId, datos.motivo);
  volver(pacienteId, resultado !== null);
}

export async function anularCargoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "caja:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = AnularConMotivoSchema.parse({
    id: texto(formData, "cargoId"),
    motivo: texto(formData, "motivo"),
  });
  const resultado = await anularCargo(ctx, datos.id, datos.motivo);
  volver(pacienteId, resultado !== null);
}

export async function anularPagoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "caja:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = AnularConMotivoSchema.parse({
    id: texto(formData, "pagoId"),
    motivo: texto(formData, "motivo"),
  });
  const resultado = await anularPago(ctx, datos.id, datos.motivo);
  volver(pacienteId, resultado !== null);
}
