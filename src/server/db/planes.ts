import "server-only";

import type { Prisma } from "./generated/client";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";
import {
  itemRequierePlanAceptado,
  puedeTransicionarItem,
  puedeTransicionarPlan,
  type EstadoPlanItem,
} from "@/lib/estados-plan";
import { toPlanDto } from "@/server/dto/planes";
import type {
  AceptarPlanInput,
  AgregarPlanItemInput,
  CrearPlanInput,
} from "@/lib/validation/planes";

import { conTenant, type TenantTransaction } from "./tenant";

const SELECT_PLAN = {
  id: true,
  titulo: true,
  estado: true,
  presentadoEn: true,
  aceptadoEn: true,
  rechazadoEn: true,
  anuladoEn: true,
  motivoAnulacion: true,
  creadoEn: true,
  creadoPor: { select: { usuario: { select: { nombre: true } } } },
  items: {
    select: {
      id: true,
      tratamientoCodigo: true,
      tratamientoNombre: true,
      precioUnitarioCentavos: true,
      descuentoCentavos: true,
      estado: true,
      diagnosticoId: true,
      creadoEn: true,
      dientes: { select: { fdi: true, superficie: true }, orderBy: [{ fdi: "asc" as const }, { superficie: "asc" as const }] },
    },
    orderBy: { creadoEn: "asc" as const },
  },
} satisfies Prisma.PlanTratamientoSelect;

async function registrarAuditoria(
  tx: TenantTransaction,
  ctx: TenantContext,
  accion: string,
  entidadId: string,
  detalle?: Prisma.InputJsonValue,
): Promise<void> {
  await tx.auditoria.create({
    data: {
      clinicaId: ctx.clinicaId,
      usuarioId: ctx.usuarioId,
      accion,
      entidad: "PLAN_TRATAMIENTO",
      entidadId,
      detalle,
    },
  });
}

async function getPlanInterno(tx: TenantTransaction, ctx: TenantContext, planId: string) {
  return tx.planTratamiento.findFirst({
    where: { id: planId, clinicaId: ctx.clinicaId },
    select: SELECT_PLAN,
  });
}

export async function crearPlan(ctx: TenantContext, input: CrearPlanInput) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const paciente = await tx.paciente.findFirst({
      where: { id: input.pacienteId, clinicaId: ctx.clinicaId },
      select: { id: true },
    });
    if (!paciente) return null;

    const plan = await tx.planTratamiento.create({
      data: {
        clinicaId: ctx.clinicaId,
        pacienteId: paciente.id,
        titulo: input.titulo,
        creadoPorId: ctx.membresiaId,
      },
      select: SELECT_PLAN,
    });
    await registrarAuditoria(tx, ctx, "PLAN_CREADO", plan.id);
    return toPlanDto(plan);
  });
}

/**
 * Agrega un tratamiento al plan. Aquí ocurre EL snapshot (ADR-006/017): el
 * odontólogo fija el precio para este paciente; nombre y código se copian del
 * catálogo. Todo queda congelado en el ítem y el catálogo deja de intervenir.
 */
export async function agregarPlanItem(ctx: TenantContext, input: AgregarPlanItemInput) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const plan = await tx.planTratamiento.findFirst({
      where: { id: input.planId, clinicaId: ctx.clinicaId },
      select: { id: true, estado: true },
    });
    if (!plan) return null;
    if (plan.estado !== "BORRADOR") {
      throw new Error("Solo se pueden agregar tratamientos a un plan en borrador.");
    }

    // Las banderas se leen del catálogo EN EL SERVIDOR; jamás del payload.
    const tratamiento = await tx.tratamiento.findFirst({
      where: { id: input.tratamientoId, clinicaId: ctx.clinicaId, activo: true },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        alcance: true,
        requiereDiente: true,
        permiteMultiplesDientes: true,
        permiteSuperficies: true,
        permiteMultiplesSuperficies: true,
        requiereDiagnostico: true,
      },
    });
    if (!tratamiento) {
      throw new Error("El tratamiento no existe o está desactivado.");
    }

    if (tratamiento.requiereDiagnostico && !input.diagnosticoId) {
      throw new Error(`«${tratamiento.nombre}» exige un diagnóstico vinculado.`);
    }
    if (input.diagnosticoId) {
      const diagnostico = await tx.diagnostico.findFirst({
        where: { id: input.diagnosticoId, clinicaId: ctx.clinicaId, anuladoEn: null },
        select: { id: true },
      });
      if (!diagnostico) throw new Error("El diagnóstico vinculado no existe o está anulado.");
    }

    const fdisDistintos = new Set(input.dientes.map((d) => d.fdi));
    if (tratamiento.alcance === "BOCA" && input.dientes.length > 0) {
      throw new Error(`«${tratamiento.nombre}» es de boca completa: no lleva piezas.`);
    }
    if (tratamiento.requiereDiente && fdisDistintos.size === 0) {
      throw new Error(`«${tratamiento.nombre}» exige indicar al menos una pieza.`);
    }
    if (!tratamiento.permiteMultiplesDientes && fdisDistintos.size > 1) {
      throw new Error(`«${tratamiento.nombre}» se asigna a una sola pieza por ítem.`);
    }
    const superficiesEspecificas = input.dientes.filter((d) => d.superficie !== "COMPLETO");
    if (!tratamiento.permiteSuperficies && superficiesEspecificas.length > 0) {
      throw new Error(`«${tratamiento.nombre}» no se registra por superficies.`);
    }
    if (!tratamiento.permiteMultiplesSuperficies && superficiesEspecificas.length > 1) {
      throw new Error(`«${tratamiento.nombre}» admite una sola superficie.`);
    }
    const item = await tx.planItem.create({
      data: {
        clinicaId: ctx.clinicaId,
        planId: plan.id,
        tratamientoId: tratamiento.id,
        diagnosticoId: input.diagnosticoId,
        // El odontólogo decide el precio de este paciente. Éste es el snapshot
        // que luego se cobra una sola vez (ADR-017).
        tratamientoCodigo: tratamiento.codigo,
        tratamientoNombre: tratamiento.nombre,
        precioUnitarioCentavos: input.precioAcordadoCentavos,
        descuentoCentavos: input.descuentoCentavos,
        creadoPorId: ctx.membresiaId,
      },
      select: { id: true },
    });
    // Aparte y en lote: `clinicaId` participa en dos relaciones y Prisma no lo
    // acepta dentro de un create anidado (ver la misma nota en diagnosticos.ts).
    if (input.dientes.length > 0) {
      await tx.planItemDiente.createMany({
        data: input.dientes.map((diente) => ({
          clinicaId: ctx.clinicaId,
          planItemId: item.id,
          fdi: diente.fdi,
          superficie: diente.superficie,
        })),
      });
    }
    await registrarAuditoria(tx, ctx, "PLAN_ITEM_AGREGADO", plan.id, {
      itemId: item.id,
      precioAcordadoCentavos: input.precioAcordadoCentavos,
      descuentoCentavos: input.descuentoCentavos,
    });
    return toPlanDto((await getPlanInterno(tx, ctx, plan.id))!);
  });
}

export async function listarPlanes(ctx: TenantContext, pacienteId: string) {
  requirePermiso(ctx, "clinico:read");
  return conTenant(ctx, async (tx) => {
    const planes = await tx.planTratamiento.findMany({
      where: { clinicaId: ctx.clinicaId, pacienteId },
      select: SELECT_PLAN,
      orderBy: { creadoEn: "desc" },
      take: 50,
    });
    return planes.map(toPlanDto);
  });
}

export async function getPlan(ctx: TenantContext, planId: string) {
  requirePermiso(ctx, "clinico:read");
  return conTenant(ctx, async (tx) => {
    const plan = await getPlanInterno(tx, ctx, planId);
    return plan ? toPlanDto(plan) : null;
  });
}

export async function presentarPlan(ctx: TenantContext, planId: string) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const plan = await tx.planTratamiento.findFirst({
      where: { id: planId, clinicaId: ctx.clinicaId },
      select: { id: true, estado: true, items: { where: { estado: "PROPUESTO" }, select: { id: true } } },
    });
    if (!plan) return null;
    if (!puedeTransicionarPlan(plan.estado, "PRESENTADO")) {
      throw new Error(`Un plan ${plan.estado} no se puede presentar.`);
    }
    if (plan.items.length === 0) {
      throw new Error("No se puede presentar un plan sin tratamientos.");
    }

    const actualizado = await tx.planTratamiento.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: plan.id } },
      data: { estado: "PRESENTADO", presentadoEn: new Date() },
      select: SELECT_PLAN,
    });
    await registrarAuditoria(tx, ctx, "PLAN_PRESENTADO", plan.id);
    return toPlanDto(actualizado);
  });
}

/**
 * UNA acción que acepta el plan y los tratamientos que el usuario marcó
 * (todos o algunos). No es cascada: es alcance explícito confirmado por una
 * sola persona, con un solo registro de auditoría que nombra cada ítem (§4.5).
 * NO crea cargos, no mueve dinero, no toca la cuenta por cobrar (ADR-007).
 */
export async function aceptarPlan(ctx: TenantContext, input: AceptarPlanInput) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const plan = await tx.planTratamiento.findFirst({
      where: { id: input.planId, clinicaId: ctx.clinicaId },
      select: { id: true, estado: true, items: { select: { id: true, estado: true } } },
    });
    if (!plan) return null;
    if (!puedeTransicionarPlan(plan.estado, "ACEPTADO")) {
      throw new Error(`Un plan ${plan.estado} no se puede aceptar.`);
    }

    const proponibles = new Map(plan.items.map((item) => [item.id, item.estado]));
    for (const itemId of input.itemIds) {
      const estado = proponibles.get(itemId);
      if (estado === undefined) throw new Error("Uno de los tratamientos no pertenece a este plan.");
      if (estado !== "PROPUESTO") {
        throw new Error("Solo se pueden aceptar tratamientos en estado propuesto.");
      }
    }

    const ahora = new Date();
    const actualizado = await tx.planTratamiento.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: plan.id } },
      data: { estado: "ACEPTADO", aceptadoEn: ahora },
      select: { id: true },
    });
    await tx.planItem.updateMany({
      where: { clinicaId: ctx.clinicaId, planId: plan.id, id: { in: input.itemIds } },
      data: { estado: "ACEPTADO" },
    });
    // Un solo registro que nombra a todos los ítems aceptados (§4.5).
    await registrarAuditoria(tx, ctx, "PLAN_ACEPTADO", actualizado.id, {
      itemsAceptados: input.itemIds,
    });
    return toPlanDto((await getPlanInterno(tx, ctx, plan.id))!);
  });
}

export async function rechazarPlan(ctx: TenantContext, planId: string) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const plan = await tx.planTratamiento.findFirst({
      where: { id: planId, clinicaId: ctx.clinicaId },
      select: { id: true, estado: true },
    });
    if (!plan) return null;
    if (!puedeTransicionarPlan(plan.estado, "RECHAZADO")) {
      throw new Error(`Un plan ${plan.estado} no se puede rechazar.`);
    }

    // Los ítems se quedan PROPUESTO (§4.5): las listas filtran por estado del plan.
    const actualizado = await tx.planTratamiento.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: plan.id } },
      data: { estado: "RECHAZADO", rechazadoEn: new Date() },
      select: SELECT_PLAN,
    });
    await registrarAuditoria(tx, ctx, "PLAN_RECHAZADO", plan.id);
    return toPlanDto(actualizado);
  });
}

/** Anular no cambia el estado de ningún ítem: impide acciones nuevas, no reescribe lo ocurrido. */
export async function anularPlan(ctx: TenantContext, planId: string, motivo: string) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const plan = await tx.planTratamiento.findFirst({
      where: { id: planId, clinicaId: ctx.clinicaId },
      select: { id: true, estado: true },
    });
    if (!plan) return null;
    if (!puedeTransicionarPlan(plan.estado, "ANULADO")) {
      throw new Error(`Un plan ${plan.estado} no se puede anular.`);
    }

    const actualizado = await tx.planTratamiento.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: plan.id } },
      data: {
        estado: "ANULADO",
        anuladoEn: new Date(),
        anuladoPorId: ctx.membresiaId,
        motivoAnulacion: motivo,
      },
      select: SELECT_PLAN,
    });
    await registrarAuditoria(tx, ctx, "PLAN_ANULADO", plan.id, { motivo });
    return toPlanDto(actualizado);
  });
}

/**
 * Transición de un ítem individual. El motivo (cancelación/anulación) queda en
 * la auditoría: plan_items solo tiene mutable (estado, actualizado_en) por
 * privilegio — agregar columnas de motivo exigiría abrir más columnas de una
 * tabla de dinero.
 */
async function transicionarItem(
  ctx: TenantContext,
  itemId: string,
  hacia: EstadoPlanItem,
  accion: string,
  motivo?: string,
) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const item = await tx.planItem.findFirst({
      where: { id: itemId, clinicaId: ctx.clinicaId },
      select: { id: true, estado: true, planId: true, plan: { select: { estado: true } } },
    });
    if (!item) return null;
    if (!puedeTransicionarItem(item.estado, hacia)) {
      throw new Error(`Un tratamiento ${item.estado} no puede pasar a ${hacia}.`);
    }
    // Coherencia §4.5: sin plan aceptado no hay progreso clínico de ítems.
    if (itemRequierePlanAceptado(hacia) && item.plan.estado !== "ACEPTADO") {
      throw new Error("El plan de este tratamiento no está aceptado.");
    }

    await tx.planItem.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: item.id } },
      data: { estado: hacia },
    });
    await registrarAuditoria(tx, ctx, accion, item.planId, {
      itemId: item.id,
      ...(motivo ? { motivo } : {}),
    });
    return toPlanDto((await getPlanInterno(tx, ctx, item.planId))!);
  });
}

/** COMPLETADO es una decisión humana del profesional, nunca un conteo de sesiones. */
export async function completarPlanItem(ctx: TenantContext, itemId: string) {
  return transicionarItem(ctx, itemId, "COMPLETADO", "PLAN_ITEM_COMPLETADO");
}

export async function cancelarPlanItem(ctx: TenantContext, itemId: string, motivo: string) {
  return transicionarItem(ctx, itemId, "CANCELADO", "PLAN_ITEM_CANCELADO", motivo);
}

export async function anularPlanItem(ctx: TenantContext, itemId: string, motivo: string) {
  return transicionarItem(ctx, itemId, "ANULADO", "PLAN_ITEM_ANULADO", motivo);
}
