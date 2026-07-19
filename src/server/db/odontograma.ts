import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma } from "./generated/client";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";
import {
  reducirHistoriaSuperficie,
  type EventoOdontogramaReducible,
} from "@/lib/odontograma";
import { toEventoOdontogramaDto, toEstadoSuperficieDto } from "@/server/dto/odontograma";
import type {
  AnularEventoOdontogramaInput,
  RegistrarCondicionInput,
} from "@/lib/validation/odontograma";

import { proyectarEstadoSuperficie } from "./raw/proyectar-estado-superficie";
import { conTenant, type TenantTransaction } from "./tenant";

const SELECT_EVENTO = {
  id: true,
  fdi: true,
  superficie: true,
  tipo: true,
  condicion: true,
  ocurridoEn: true,
  creadoEn: true,
  anulaEventoId: true,
  motivoAnulacion: true,
  registradoPor: { select: { usuario: { select: { nombre: true } } } },
} satisfies Prisma.EventoOdontogramaSelect;

async function registrarAuditoria(
  tx: TenantTransaction,
  ctx: TenantContext,
  accion: string,
  eventoId: string,
): Promise<void> {
  await tx.auditoria.create({
    data: {
      clinicaId: ctx.clinicaId,
      usuarioId: ctx.usuarioId,
      accion,
      entidad: "ODONTOGRAMA",
      entidadId: eventoId,
    },
  });
}

async function eventosDeSuperficie(
  tx: TenantTransaction,
  ctx: TenantContext,
  pacienteId: string,
  fdi: number,
  superficie: RegistrarCondicionInput["superficie"],
): Promise<EventoOdontogramaReducible[]> {
  return tx.eventoOdontograma.findMany({
    where: { clinicaId: ctx.clinicaId, pacienteId, fdi, superficie },
    select: {
      id: true,
      tipo: true,
      condicion: true,
      ocurridoEn: true,
      creadoEn: true,
      anulaEventoId: true,
    },
  });
}

/**
 * Recalcula la proyección de UNA superficie plegando su historia completa con
 * el mismo reducer del rebuild. Es el único camino válido para CONDICION_ANULADA:
 * el estado correcto sale del último evento no anulado anterior, que el evento
 * de anulación no conoce (ARQUITECTURA §10.1).
 */
/** Exportada para que la anulación de procedimientos (Fase 8) use EL MISMO camino. */
export async function recalcularSuperficie(
  tx: TenantTransaction,
  ctx: TenantContext,
  pacienteId: string,
  fdi: number,
  superficie: RegistrarCondicionInput["superficie"],
): Promise<void> {
  const eventos = await eventosDeSuperficie(tx, ctx, pacienteId, fdi, superficie);
  const estado = reducirHistoriaSuperficie(eventos);

  if (estado === null) {
    await tx.estadoSuperficie.deleteMany({
      where: { clinicaId: ctx.clinicaId, pacienteId, fdi, superficie },
    });
    return;
  }

  await tx.estadoSuperficie.upsert({
    where: {
      clinicaId_pacienteId_fdi_superficie: {
        clinicaId: ctx.clinicaId,
        pacienteId,
        fdi,
        superficie,
      },
    },
    create: {
      clinicaId: ctx.clinicaId,
      pacienteId,
      fdi,
      superficie,
      condicion: estado.condicion,
      tratamientoPendiente: estado.tratamientoPendiente,
      ultimoEventoId: estado.ultimoEventoId,
      ultimoEventoEn: estado.ultimoEventoEn,
      ultimoEventoCreadoEn: estado.ultimoEventoCreadoEn,
    },
    update: {
      condicion: estado.condicion,
      tratamientoPendiente: estado.tratamientoPendiente,
      ultimoEventoId: estado.ultimoEventoId,
      ultimoEventoEn: estado.ultimoEventoEn,
      ultimoEventoCreadoEn: estado.ultimoEventoCreadoEn,
    },
  });
}

export async function registrarCondicion(ctx: TenantContext, input: RegistrarCondicionInput) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const paciente = await tx.paciente.findFirst({
      where: { id: input.pacienteId, clinicaId: ctx.clinicaId },
      select: { id: true },
    });
    if (!paciente) return null;

    if (input.diagnosticoId) {
      const diagnostico = await tx.diagnostico.findFirst({
        where: { id: input.diagnosticoId, clinicaId: ctx.clinicaId, anuladoEn: null },
        select: { id: true },
      });
      if (!diagnostico) {
        throw new Error("El diagnóstico vinculado no existe o está anulado.");
      }
    }

    const evento = await tx.eventoOdontograma.create({
      data: {
        clinicaId: ctx.clinicaId,
        pacienteId: paciente.id,
        fdi: input.fdi,
        superficie: input.superficie,
        tipo: "CONDICION_REGISTRADA",
        condicion: input.condicion,
        ocurridoEn: input.ocurridoEn,
        registradoPorId: ctx.membresiaId,
        diagnosticoId: input.diagnosticoId,
      },
      select: SELECT_EVENTO,
    });

    // Camino aditivo: upsert condicional por tupla. Un evento retroactivo no
    // puede pisar uno más nuevo — la condición WHERE simplemente no actualiza.
    await proyectarEstadoSuperficie(tx, {
      // randomUUID en vez del cuid() de Prisma: el id solo debe ser único, y el
      // upsert crudo no pasa por los defaults del cliente. Sin dependencias nuevas.
      id: randomUUID(),
      clinicaId: ctx.clinicaId,
      pacienteId: paciente.id,
      fdi: input.fdi,
      superficie: input.superficie,
      condicion: input.condicion,
      tratamientoPendiente: false,
      ultimoEventoId: evento.id,
      ultimoEventoEn: evento.ocurridoEn,
      ultimoEventoCreadoEn: evento.creadoEn,
    });

    await registrarAuditoria(tx, ctx, "ODONTOGRAMA_CONDICION_REGISTRADA", evento.id);
    return toEventoOdontogramaDto(evento);
  });
}

export async function anularEventoOdontograma(
  ctx: TenantContext,
  input: AnularEventoOdontogramaInput,
) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const objetivo = await tx.eventoOdontograma.findFirst({
      where: {
        id: input.eventoId,
        clinicaId: ctx.clinicaId,
        pacienteId: input.pacienteId,
        tipo: { not: "CONDICION_ANULADA" },
        anuladoPorEvento: null,
      },
      select: { id: true, pacienteId: true, fdi: true, superficie: true },
    });
    if (!objetivo) return null;

    const anulacion = await tx.eventoOdontograma.create({
      data: {
        clinicaId: ctx.clinicaId,
        pacienteId: objetivo.pacienteId,
        fdi: objetivo.fdi,
        superficie: objetivo.superficie,
        tipo: "CONDICION_ANULADA",
        ocurridoEn: new Date(),
        registradoPorId: ctx.membresiaId,
        anulaEventoId: objetivo.id,
        motivoAnulacion: input.motivoAnulacion,
      },
      select: SELECT_EVENTO,
    });

    // CONDICION_ANULADA no se proyecta con UPDATE: se RECALCULA la superficie.
    await recalcularSuperficie(tx, ctx, objetivo.pacienteId, objetivo.fdi, objetivo.superficie);

    await registrarAuditoria(tx, ctx, "ODONTOGRAMA_CONDICION_ANULADA", anulacion.id);
    return toEventoOdontogramaDto(anulacion);
  });
}

export async function getOdontograma(ctx: TenantContext, pacienteId: string) {
  requirePermiso(ctx, "clinico:read");
  return conTenant(ctx, async (tx) => {
    const paciente = await tx.paciente.findFirst({
      where: { id: pacienteId, clinicaId: ctx.clinicaId },
      select: { id: true },
    });
    if (!paciente) return null;

    const [estados, eventos] = await Promise.all([
      tx.estadoSuperficie.findMany({
        where: { clinicaId: ctx.clinicaId, pacienteId },
        select: {
          fdi: true,
          superficie: true,
          condicion: true,
          tratamientoPendiente: true,
          ultimoEventoEn: true,
        },
        orderBy: [{ fdi: "asc" }, { superficie: "asc" }],
      }),
      tx.eventoOdontograma.findMany({
        where: { clinicaId: ctx.clinicaId, pacienteId },
        select: SELECT_EVENTO,
        orderBy: [{ ocurridoEn: "desc" }, { creadoEn: "desc" }],
        take: 100,
      }),
    ]);

    const anulados = new Set(
      eventos.filter((e) => e.anulaEventoId !== null).map((e) => e.anulaEventoId as string),
    );
    return {
      estados: estados.map(toEstadoSuperficieDto),
      eventos: eventos.map((evento) => ({
        ...toEventoOdontogramaDto(evento),
        anulado: anulados.has(evento.id),
      })),
    };
  });
}

/**
 * Regenera la proyección completa del paciente desde el log. La prueba de
 * equivalencia la corre tras una secuencia con evento retroactivo y anulación
 * y afirma que NADA cambió: si el camino en vivo y este reducer divergen, ahí
 * truena (ARQUITECTURA §10.1).
 */
export async function reconstruirOdontograma(ctx: TenantContext, pacienteId: string) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const eventos = await tx.eventoOdontograma.findMany({
      where: { clinicaId: ctx.clinicaId, pacienteId },
      select: {
        id: true,
        fdi: true,
        superficie: true,
        tipo: true,
        condicion: true,
        ocurridoEn: true,
        creadoEn: true,
        anulaEventoId: true,
      },
    });

    const porSuperficie = new Map<string, typeof eventos>();
    for (const evento of eventos) {
      const clave = `${evento.fdi}:${evento.superficie}`;
      const grupo = porSuperficie.get(clave) ?? [];
      grupo.push(evento);
      porSuperficie.set(clave, grupo);
    }

    await tx.estadoSuperficie.deleteMany({ where: { clinicaId: ctx.clinicaId, pacienteId } });

    let proyectadas = 0;
    for (const grupo of porSuperficie.values()) {
      const estado = reducirHistoriaSuperficie(grupo);
      if (estado === null) continue;
      const { fdi, superficie } = grupo[0];
      await tx.estadoSuperficie.create({
        data: {
          clinicaId: ctx.clinicaId,
          pacienteId,
          fdi,
          superficie,
          condicion: estado.condicion,
          tratamientoPendiente: estado.tratamientoPendiente,
          ultimoEventoId: estado.ultimoEventoId,
          ultimoEventoEn: estado.ultimoEventoEn,
          ultimoEventoCreadoEn: estado.ultimoEventoCreadoEn,
        },
      });
      proyectadas += 1;
    }
    return { superficiesProyectadas: proyectadas };
  });
}
