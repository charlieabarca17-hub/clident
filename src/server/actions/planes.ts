"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { centavosDesdeTexto } from "@/lib/money";
import {
  AceptarPlanSchema,
  AgregarPlanItemSchema,
  CrearPlanSchema,
  MotivoItemSchema,
  MotivoPlanSchema,
} from "@/lib/validation/planes";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import {
  aceptarPlan,
  agregarPlanItem,
  anularPlan,
  anularPlanItem,
  cancelarPlanItem,
  completarPlanItem,
  crearPlan,
  presentarPlan,
  rechazarPlan,
} from "@/server/db/planes";

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

function rutaPlan(pacienteId: string, planId: string): string {
  return `/pacientes/${pacienteId}/planes/${planId}`;
}

export async function crearPlanDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const datos = CrearPlanSchema.parse({
    pacienteId: texto(formData, "pacienteId"),
    titulo: texto(formData, "titulo"),
  });
  const plan = await crearPlan(ctx, datos);
  if (!plan) redirect(`/pacientes/${datos.pacienteId}/planes?estado=no-disponible`);
  revalidatePath(`/pacientes/${datos.pacienteId}/planes`);
  redirect(rutaPlan(datos.pacienteId, plan.id));
}

export async function agregarPlanItemDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const descuentoTexto = texto(formData, "descuento");
  const datos = AgregarPlanItemSchema.parse({
    planId: texto(formData, "planId"),
    tratamientoId: texto(formData, "tratamientoId"),
    diagnosticoId: texto(formData, "diagnosticoId"),
    descuentoCentavos: descuentoTexto ? centavosDesdeTexto(descuentoTexto) : 0,
    dientes: dientesDelFormulario(formData),
  });
  const plan = await agregarPlanItem(ctx, datos);
  if (!plan) redirect(`/pacientes/${pacienteId}/planes?estado=no-disponible`);
  revalidatePath(rutaPlan(pacienteId, datos.planId));
  redirect(rutaPlan(pacienteId, datos.planId));
}

async function transicionDePlan(
  formData: FormData,
  operacion: (ctx: Parameters<typeof presentarPlan>[0], planId: string) => Promise<unknown>,
): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const planId = texto(formData, "planId");
  const plan = await operacion(ctx, planId);
  revalidatePath(rutaPlan(pacienteId, planId));
  redirect(
    plan ? rutaPlan(pacienteId, planId) : `/pacientes/${pacienteId}/planes?estado=no-disponible`,
  );
}

export async function presentarPlanDesdeFormulario(formData: FormData): Promise<never> {
  return transicionDePlan(formData, (ctx, planId) => presentarPlan(ctx, planId));
}

export async function rechazarPlanDesdeFormulario(formData: FormData): Promise<never> {
  return transicionDePlan(formData, (ctx, planId) => rechazarPlan(ctx, planId));
}

export async function aceptarPlanDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = AceptarPlanSchema.parse({
    planId: texto(formData, "planId"),
    itemIds: formData.getAll("itemIds").map((valor) => String(valor)),
  });
  const plan = await aceptarPlan(ctx, datos);
  revalidatePath(rutaPlan(pacienteId, datos.planId));
  redirect(
    plan
      ? rutaPlan(pacienteId, datos.planId)
      : `/pacientes/${pacienteId}/planes?estado=no-disponible`,
  );
}

export async function anularPlanDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = MotivoPlanSchema.parse({
    planId: texto(formData, "planId"),
    motivo: texto(formData, "motivo"),
  });
  const plan = await anularPlan(ctx, datos.planId, datos.motivo);
  revalidatePath(rutaPlan(pacienteId, datos.planId));
  redirect(
    plan
      ? rutaPlan(pacienteId, datos.planId)
      : `/pacientes/${pacienteId}/planes?estado=no-disponible`,
  );
}

async function transicionDeItem(
  formData: FormData,
  operacion: "completar" | "cancelar" | "anular",
): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const planId = texto(formData, "planId");

  let plan: unknown;
  if (operacion === "completar") {
    plan = await completarPlanItem(ctx, texto(formData, "itemId"));
  } else {
    const datos = MotivoItemSchema.parse({
      itemId: texto(formData, "itemId"),
      motivo: texto(formData, "motivo"),
    });
    plan =
      operacion === "cancelar"
        ? await cancelarPlanItem(ctx, datos.itemId, datos.motivo)
        : await anularPlanItem(ctx, datos.itemId, datos.motivo);
  }
  revalidatePath(rutaPlan(pacienteId, planId));
  redirect(
    plan ? rutaPlan(pacienteId, planId) : `/pacientes/${pacienteId}/planes?estado=no-disponible`,
  );
}

export async function completarPlanItemDesdeFormulario(formData: FormData): Promise<never> {
  return transicionDeItem(formData, "completar");
}

export async function cancelarPlanItemDesdeFormulario(formData: FormData): Promise<never> {
  return transicionDeItem(formData, "cancelar");
}

export async function anularPlanItemDesdeFormulario(formData: FormData): Promise<never> {
  return transicionDeItem(formData, "anular");
}
