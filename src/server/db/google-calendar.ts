import "server-only";

import type { EstadoSincronizacionCalendario } from "./generated/client";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";

import { conTenant } from "./tenant";

export async function getEstadoGoogleCalendar(ctx: TenantContext) {
  requirePermiso(ctx, "agenda:read");
  return conTenant(ctx, async (tx) => tx.conexionGoogleCalendar.findUnique({
    where: {
      clinicaId_membresiaId: { clinicaId: ctx.clinicaId, membresiaId: ctx.membresiaId },
    },
    select: {
      correoGoogle: true,
      calendarioNombre: true,
      activa: true,
      conectadoEn: true,
      actualizadoEn: true,
    },
  }));
}

export async function guardarConexionGoogleCalendar(
  ctx: TenantContext,
  data: {
    correoGoogle: string;
    refreshTokenCifrado: string;
    calendarioId: string;
    scopes: string[];
  },
) {
  requirePermiso(ctx, "agenda:read");
  return conTenant(ctx, async (tx) => {
    const conexion = await tx.conexionGoogleCalendar.upsert({
      where: {
        clinicaId_membresiaId: { clinicaId: ctx.clinicaId, membresiaId: ctx.membresiaId },
      },
      update: { ...data, calendarioNombre: "CLIDENT", activa: true },
      create: {
        clinicaId: ctx.clinicaId,
        membresiaId: ctx.membresiaId,
        calendarioNombre: "CLIDENT",
        activa: true,
        ...data,
      },
      select: { id: true },
    });
    await tx.auditoria.create({
      data: {
        clinicaId: ctx.clinicaId,
        usuarioId: ctx.usuarioId,
        accion: "GOOGLE_CALENDAR_CONECTADO",
        entidad: "INTEGRACION",
        entidadId: conexion.id,
        detalle: { correoGoogle: data.correoGoogle, calendario: "CLIDENT" },
      },
    });
    return conexion;
  });
}

export async function getConexionGoogleCalendarPrivada(ctx: TenantContext) {
  requirePermiso(ctx, "agenda:read");
  return conTenant(ctx, async (tx) => tx.conexionGoogleCalendar.findUnique({
    where: {
      clinicaId_membresiaId: { clinicaId: ctx.clinicaId, membresiaId: ctx.membresiaId },
    },
    select: { id: true, refreshTokenCifrado: true, calendarioId: true, activa: true },
  }));
}

export async function desactivarGoogleCalendar(ctx: TenantContext) {
  requirePermiso(ctx, "agenda:read");
  return conTenant(ctx, async (tx) => {
    const existente = await tx.conexionGoogleCalendar.findUnique({
      where: {
        clinicaId_membresiaId: { clinicaId: ctx.clinicaId, membresiaId: ctx.membresiaId },
      },
      select: { id: true },
    });
    if (!existente) return null;
    await tx.conexionGoogleCalendar.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: existente.id } },
      data: { activa: false },
    });
    await tx.auditoria.create({
      data: {
        clinicaId: ctx.clinicaId,
        usuarioId: ctx.usuarioId,
        accion: "GOOGLE_CALENDAR_DESCONECTADO",
        entidad: "INTEGRACION",
        entidadId: existente.id,
      },
    });
    return existente;
  });
}

export async function getCitaParaGoogleCalendar(ctx: TenantContext, citaId: string) {
  requirePermiso(ctx, "agenda:read");
  return conTenant(ctx, async (tx) => tx.cita.findFirst({
    where: { id: citaId, clinicaId: ctx.clinicaId },
    select: {
      id: true,
      inicioEn: true,
      finEn: true,
      estado: true,
      odontologoId: true,
      clinica: { select: { nombre: true } },
      sucursal: { select: { nombre: true } },
      sincronizacionesGoogle: {
        select: { id: true, googleEventoId: true, conexionId: true },
        take: 1,
      },
      odontologo: {
        select: {
          conexionGoogleCalendar: {
            select: {
              id: true,
              refreshTokenCifrado: true,
              calendarioId: true,
              activa: true,
            },
          },
        },
      },
    },
  }));
}

export async function guardarEstadoSincronizacionGoogle(
  ctx: TenantContext,
  data: {
    citaId: string;
    conexionId: string;
    googleEventoId: string;
    estado: EstadoSincronizacionCalendario;
    ultimoError?: string | null;
  },
) {
  requirePermiso(ctx, "agenda:read");
  return conTenant(ctx, async (tx) => tx.sincronizacionCitaGoogle.upsert({
    where: {
      clinicaId_citaId_conexionId: {
        clinicaId: ctx.clinicaId,
        citaId: data.citaId,
        conexionId: data.conexionId,
      },
    },
    update: {
      googleEventoId: data.googleEventoId,
      estado: data.estado,
      ultimoError: data.ultimoError ?? null,
      sincronizadoEn: data.estado === "ERROR" ? undefined : new Date(),
    },
    create: {
      clinicaId: ctx.clinicaId,
      citaId: data.citaId,
      conexionId: data.conexionId,
      googleEventoId: data.googleEventoId,
      estado: data.estado,
      ultimoError: data.ultimoError ?? null,
      sincronizadoEn: data.estado === "ERROR" ? null : new Date(),
    },
  }));
}
