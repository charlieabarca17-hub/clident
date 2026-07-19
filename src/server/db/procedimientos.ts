import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma } from "./generated/client";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";
import { puedeEditarNotaDirecto } from "@/lib/procedimientos";
import { toProcedimientoDto } from "@/server/dto/procedimientos";
import type {
  RealizarProcedimientoInput,
} from "@/lib/validation/procedimientos";

import { recalcularSuperficie } from "./odontograma";
import { proyectarEstadoSuperficie } from "./raw/proyectar-estado-superficie";
import { conTenant, type TenantTransaction } from "./tenant";

const SELECT_PROCEDIMIENTO = {
  id: true,
  planItemId: true,
  tratamientoCodigo: true,
  tratamientoNombre: true,
  realizadoEn: true,
  precioAplicadoCentavos: true,
  estado: true,
  notasClinicas: true,
  anuladoEn: true,
  motivoAnulacion: true,
  creadoEn: true,
  creadoPorId: true,
  odontologo: { select: { usuario: { select: { nombre: true } } } },
  dientes: {
    select: { fdi: true, superficie: true },
    orderBy: [{ fdi: "asc" as const }, { superficie: "asc" as const }],
  },
  enmiendas: {
    select: {
      id: true,
      textoAnterior: true,
      textoNuevo: true,
      motivo: true,
      creadoEn: true,
      creadaPor: { select: { usuario: { select: { nombre: true } } } },
    },
    orderBy: { creadoEn: "asc" as const },
  },
} satisfies Prisma.ProcedimientoSelect;

async function registrarAuditoria(
  tx: TenantTransaction,
  ctx: TenantContext,
  accion: string,
  procedimientoId: string,
  detalle?: Prisma.InputJsonValue,
): Promise<void> {
  await tx.auditoria.create({
    data: {
      clinicaId: ctx.clinicaId,
      usuarioId: ctx.usuarioId,
      accion,
      entidad: "PROCEDIMIENTO",
      entidadId: procedimientoId,
      detalle,
    },
  });
}

async function sucursalPredeterminada(tx: TenantTransaction, clinicaId: string): Promise<string> {
  const sucursales = await tx.sucursal.findMany({
    where: { clinicaId },
    select: { id: true },
    orderBy: { creadoEn: "asc" },
    take: 2,
  });
  if (sucursales.length === 0) throw new Error("La clínica no tiene una sucursal disponible.");
  if (sucursales.length > 1) throw new Error("Elegí una sede antes de registrar el procedimiento.");
  return sucursales[0].id;
}

/**
 * Registra el hecho clínico. Efectos en LA MISMA transacción:
 * 1. Fila inmutable de procedimiento (snapshot de tratamiento y precio del ítem).
 * 2. Dientes append-only.
 * 3. Eventos PROCEDIMIENTO_REALIZADO en el odontograma (camino aditivo).
 * 4. El plan avanza: ACEPTADO → EN_PROCESO en la primera sesión.
 * Lo que NO hace: crear cargos. Eso es una decisión humana de Caja (ADR-007).
 */
export async function realizarProcedimiento(
  ctx: TenantContext,
  input: RealizarProcedimientoInput,
) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const planItem = await tx.planItem.findFirst({
      where: { id: input.planItemId, clinicaId: ctx.clinicaId },
      select: {
        id: true,
        estado: true,
        tratamientoId: true,
        tratamientoCodigo: true,
        tratamientoNombre: true,
        precioUnitarioCentavos: true,
        descuentoCentavos: true,
        plan: { select: { estado: true, pacienteId: true } },
        // Banderas del catálogo: comportamiento, NUNCA precio (ADR-006).
        tratamiento: {
          select: {
            alcance: true,
            requiereDiente: true,
            permiteMultiplesDientes: true,
            permiteSuperficies: true,
            permiteMultiplesSuperficies: true,
            permiteMultiplesSesiones: true,
          },
        },
      },
    });
    if (!planItem || planItem.plan.pacienteId !== input.pacienteId) return null;

    if (planItem.plan.estado !== "ACEPTADO") {
      throw new Error("El plan de este tratamiento no está aceptado por el paciente.");
    }
    if (planItem.estado !== "ACEPTADO" && planItem.estado !== "EN_PROCESO") {
      throw new Error(`No se puede registrar una sesión sobre un tratamiento ${planItem.estado}.`);
    }
    if (planItem.estado === "EN_PROCESO" && !planItem.tratamiento.permiteMultiplesSesiones) {
      throw new Error("Este tratamiento es de una sola sesión y ya tiene una registrada.");
    }

    const banderas = planItem.tratamiento;
    const fdisDistintos = new Set(input.dientes.map((d) => d.fdi));
    if (banderas.alcance === "BOCA" && input.dientes.length > 0) {
      throw new Error("Este tratamiento es de boca completa: no lleva piezas.");
    }
    if (banderas.requiereDiente && fdisDistintos.size === 0) {
      throw new Error("Este tratamiento exige indicar al menos una pieza.");
    }
    if (!banderas.permiteMultiplesDientes && fdisDistintos.size > 1) {
      throw new Error("Este tratamiento cubre una sola pieza por sesión.");
    }
    const superficiesEspecificas = input.dientes.filter((d) => d.superficie !== "COMPLETO");
    if (!banderas.permiteSuperficies && superficiesEspecificas.length > 0) {
      throw new Error("Este tratamiento no se registra por superficies.");
    }
    if (!banderas.permiteMultiplesSuperficies && superficiesEspecificas.length > 1) {
      throw new Error("Este tratamiento admite una sola superficie.");
    }

    const creado = await tx.procedimiento.create({
      data: {
        clinicaId: ctx.clinicaId,
        sucursalId: await sucursalPredeterminada(tx, ctx.clinicaId),
        pacienteId: input.pacienteId,
        planItemId: planItem.id,
        odontologoId: ctx.membresiaId,
        // Snapshots del ÍTEM (que ya congeló el catálogo en la Fase 7): el
        // precio aplicado nace del precio final que el paciente aceptó.
        // Cuánto vale cada sesión de un multi-sesión es la pendiente #10;
        // mientras se decide, cada sesión registra el precio del ítem.
        tratamientoId: planItem.tratamientoId,
        tratamientoCodigo: planItem.tratamientoCodigo,
        tratamientoNombre: planItem.tratamientoNombre,
        precioAplicadoCentavos: planItem.precioUnitarioCentavos - planItem.descuentoCentavos,
        realizadoEn: input.realizadoEn,
        notasClinicas: input.notasClinicas,
        creadoPorId: ctx.membresiaId,
      },
      select: { id: true },
    });
    // Aparte y en lote: `clinicaId` participa en dos relaciones y Prisma no lo
    // acepta dentro de un create anidado (ver la nota en diagnosticos.ts).
    if (input.dientes.length > 0) {
      await tx.procedimientoDiente.createMany({
        data: input.dientes.map((diente) => ({
          clinicaId: ctx.clinicaId,
          procedimientoId: creado.id,
          fdi: diente.fdi,
          superficie: diente.superficie,
        })),
      });
    }
    const procedimiento = await tx.procedimiento.findFirstOrThrow({
      where: { id: creado.id, clinicaId: ctx.clinicaId },
      select: SELECT_PROCEDIMIENTO,
    });

    // El procedimiento pinta el odontograma: un evento por (pieza, cara), con
    // la condición resultante que declaró el profesional.
    if (input.condicionResultante) {
      for (const diente of input.dientes) {
        const evento = await tx.eventoOdontograma.create({
          data: {
            clinicaId: ctx.clinicaId,
            pacienteId: input.pacienteId,
            fdi: diente.fdi,
            superficie: diente.superficie,
            tipo: "PROCEDIMIENTO_REALIZADO",
            condicion: input.condicionResultante,
            ocurridoEn: input.realizadoEn,
            registradoPorId: ctx.membresiaId,
            procedimientoId: procedimiento.id,
          },
          select: { id: true, ocurridoEn: true, creadoEn: true },
        });
        await proyectarEstadoSuperficie(tx, {
          id: randomUUID(),
          clinicaId: ctx.clinicaId,
          pacienteId: input.pacienteId,
          fdi: diente.fdi,
          superficie: diente.superficie,
          condicion: input.condicionResultante,
          tratamientoPendiente: false,
          ultimoEventoId: evento.id,
          ultimoEventoEn: evento.ocurridoEn,
          ultimoEventoCreadoEn: evento.creadoEn,
        });
      }
    }

    // Primera sesión: el ítem avanza a EN_PROCESO. Declararlo COMPLETADO sigue
    // siendo una decisión humana aparte — nunca un conteo (§4.4).
    if (planItem.estado === "ACEPTADO") {
      await tx.planItem.update({
        where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: planItem.id } },
        data: { estado: "EN_PROCESO" },
      });
    }

    await registrarAuditoria(tx, ctx, "PROCEDIMIENTO_REALIZADO", procedimiento.id);
    return toProcedimientoDto(procedimiento);
  });
}

export async function listarProcedimientos(ctx: TenantContext, pacienteId: string) {
  requirePermiso(ctx, "clinico:read");
  return conTenant(ctx, async (tx) => {
    const procedimientos = await tx.procedimiento.findMany({
      where: { clinicaId: ctx.clinicaId, pacienteId },
      select: SELECT_PROCEDIMIENTO,
      orderBy: { realizadoEn: "desc" },
      take: 100,
    });
    return procedimientos.map(toProcedimientoDto);
  });
}

/** Edición directa: solo el autor, solo dentro de la ventana de 12 h. */
export async function editarNotaClinica(
  ctx: TenantContext,
  procedimientoId: string,
  notasClinicas: string,
) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const procedimiento = await tx.procedimiento.findFirst({
      where: { id: procedimientoId, clinicaId: ctx.clinicaId, estado: "REALIZADO" },
      select: { id: true, creadoEn: true, creadoPorId: true },
    });
    if (!procedimiento) return null;
    if (
      !puedeEditarNotaDirecto({
        creadoEn: procedimiento.creadoEn,
        autorId: procedimiento.creadoPorId,
        membresiaActualId: ctx.membresiaId,
      })
    ) {
      throw new Error(
        "La ventana de edición directa (12 horas, solo el autor) ya cerró: registrá una enmienda.",
      );
    }

    const actualizado = await tx.procedimiento.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: procedimiento.id } },
      data: { notasClinicas },
      select: SELECT_PROCEDIMIENTO,
    });
    await registrarAuditoria(tx, ctx, "PROCEDIMIENTO_NOTA_EDITADA", procedimiento.id);
    return toProcedimientoDto(actualizado);
  });
}

/**
 * Enmienda: la corrección después de la ventana. INSERTA una fila append-only
 * que preserva el texto anterior y recién entonces actualiza la nota visible.
 * La base impide editar o borrar la enmienda: la preservación no es ficción.
 */
export async function enmendarNotaClinica(
  ctx: TenantContext,
  input: { procedimientoId: string; textoNuevo: string; motivo: string },
) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const procedimiento = await tx.procedimiento.findFirst({
      where: { id: input.procedimientoId, clinicaId: ctx.clinicaId, estado: "REALIZADO" },
      select: { id: true, notasClinicas: true },
    });
    if (!procedimiento) return null;

    const enmienda = await tx.enmiendaProcedimiento.create({
      data: {
        clinicaId: ctx.clinicaId,
        procedimientoId: procedimiento.id,
        textoAnterior: procedimiento.notasClinicas,
        textoNuevo: input.textoNuevo,
        motivo: input.motivo,
        creadaPorId: ctx.membresiaId,
      },
      select: { id: true },
    });
    const actualizado = await tx.procedimiento.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: procedimiento.id } },
      data: { notasClinicas: input.textoNuevo },
      select: SELECT_PROCEDIMIENTO,
    });
    await registrarAuditoria(tx, ctx, "PROCEDIMIENTO_NOTA_ENMENDADA", procedimiento.id, {
      enmiendaId: enmienda.id,
    });
    return toProcedimientoDto(actualizado);
  });
}

/**
 * Anula el procedimiento: estado ANULADO + evento compensatorio en el
 * odontograma por cada evento que este procedimiento generó, con recálculo
 * de cada superficie (el mismo camino de CONDICION_ANULADA de la Fase 6).
 * Nunca delete. (El candado "no anular si ya está cobrado" llega con Caja.)
 */
export async function anularProcedimiento(
  ctx: TenantContext,
  procedimientoId: string,
  motivoAnulacion: string,
) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const procedimiento = await tx.procedimiento.findFirst({
      where: { id: procedimientoId, clinicaId: ctx.clinicaId, estado: "REALIZADO" },
      select: { id: true, pacienteId: true },
    });
    if (!procedimiento) return null;

    const actualizado = await tx.procedimiento.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: procedimiento.id } },
      data: {
        estado: "ANULADO",
        anuladoEn: new Date(),
        anuladoPorId: ctx.membresiaId,
        motivoAnulacion,
      },
      select: SELECT_PROCEDIMIENTO,
    });

    // Eventos compensatorios: anular cada evento que este procedimiento pintó.
    const eventos = await tx.eventoOdontograma.findMany({
      where: {
        clinicaId: ctx.clinicaId,
        procedimientoId: procedimiento.id,
        tipo: "PROCEDIMIENTO_REALIZADO",
        anuladoPorEvento: null,
      },
      select: { id: true, fdi: true, superficie: true },
    });
    for (const evento of eventos) {
      await tx.eventoOdontograma.create({
        data: {
          clinicaId: ctx.clinicaId,
          pacienteId: procedimiento.pacienteId,
          fdi: evento.fdi,
          superficie: evento.superficie,
          tipo: "CONDICION_ANULADA",
          ocurridoEn: new Date(),
          registradoPorId: ctx.membresiaId,
          anulaEventoId: evento.id,
          motivoAnulacion,
        },
      });
      // CONDICION_ANULADA jamás se proyecta con UPDATE: recálculo completo,
      // con el MISMO camino de la Fase 6.
      await recalcularSuperficie(tx, ctx, procedimiento.pacienteId, evento.fdi, evento.superficie);
    }

    await registrarAuditoria(tx, ctx, "PROCEDIMIENTO_ANULADO", procedimiento.id, {
      motivo: motivoAnulacion,
      eventosCompensados: eventos.map((e) => e.id),
    });
    return toProcedimientoDto(actualizado);
  });
}
