import "server-only";

import type { Prisma } from "./generated/client";
import type {
  CrearAlertaMedicaInput,
  DesactivarAlertaMedicaInput,
} from "@/lib/validation/alertas-medicas";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";
import { toAlertaMedicaDto } from "@/server/dto/alertas-medicas";

import { conTenant, type TenantTransaction } from "./tenant";

const SELECT_ALERTA = {
  id: true,
  titulo: true,
  detalle: true,
  creadoEn: true,
  creadaPor: { select: { usuario: { select: { nombre: true } } } },
} satisfies Prisma.AlertaMedicaSelect;

async function registrarAuditoria(
  tx: TenantTransaction,
  ctx: TenantContext,
  accion: string,
  alertaId: string,
): Promise<void> {
  await tx.auditoria.create({
    data: {
      clinicaId: ctx.clinicaId,
      usuarioId: ctx.usuarioId,
      accion,
      entidad: "ALERTA_MEDICA",
      entidadId: alertaId,
    },
  });
}

export async function listarAlertasMedicasActivas(ctx: TenantContext, pacienteId: string) {
  requirePermiso(ctx, "clinico:read");
  return conTenant(ctx, async (tx) => {
    const alertas = await tx.alertaMedica.findMany({
      where: {
        clinicaId: ctx.clinicaId,
        desactivacion: null,
        expediente: { pacienteId, clinicaId: ctx.clinicaId },
      },
      select: SELECT_ALERTA,
      orderBy: { creadoEn: "desc" },
    });
    return alertas.map(toAlertaMedicaDto);
  });
}

export async function crearAlertaMedica(ctx: TenantContext, input: CrearAlertaMedicaInput) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const expediente = await tx.expediente.findFirst({
      where: { clinicaId: ctx.clinicaId, pacienteId: input.pacienteId },
      select: { id: true },
    });
    if (!expediente) return null;

    const alerta = await tx.alertaMedica.create({
      data: {
        clinicaId: ctx.clinicaId,
        expedienteId: expediente.id,
        titulo: input.titulo,
        detalle: input.detalle,
        creadaPorId: ctx.membresiaId,
      },
      select: SELECT_ALERTA,
    });
    await registrarAuditoria(tx, ctx, "ALERTA_MEDICA_CREADA", alerta.id);
    return toAlertaMedicaDto(alerta);
  });
}

/**
 * El cierre es append-only: una segunda solicitud no sobrescribe el motivo ni
 * duplica auditoría, y no existe una operación que reactive la alerta original.
 */
export async function desactivarAlertaMedica(
  ctx: TenantContext,
  alertaId: string,
  input: DesactivarAlertaMedicaInput,
): Promise<boolean> {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const alerta = await tx.alertaMedica.findFirst({
      where: { id: alertaId, clinicaId: ctx.clinicaId },
      select: { id: true },
    });
    if (!alerta) return false;

    const resultado = await tx.desactivacionAlertaMedica.createMany({
      data: {
        clinicaId: ctx.clinicaId,
        alertaId: alerta.id,
        desactivadaPorId: ctx.membresiaId,
        motivoDesactivacion: input.motivoDesactivacion,
      },
      skipDuplicates: true,
    });
    if (resultado.count === 0) return false;

    await registrarAuditoria(tx, ctx, "ALERTA_MEDICA_DESACTIVADA", alertaId);
    return true;
  });
}
