import "server-only";

import type { Prisma } from "./generated/client";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";
import { toDiagnosticoDto } from "@/server/dto/diagnosticos";
import type {
  AnularDiagnosticoInput,
  CrearDiagnosticoInput,
} from "@/lib/validation/diagnosticos";

import { conTenant, type TenantTransaction } from "./tenant";

const SELECT_DIAGNOSTICO = {
  id: true,
  descripcion: true,
  notas: true,
  alcance: true,
  creadoEn: true,
  anuladoEn: true,
  motivoAnulacion: true,
  registradoPor: { select: { usuario: { select: { nombre: true } } } },
  anuladoPor: { select: { usuario: { select: { nombre: true } } } },
  dientes: {
    select: { fdi: true, superficie: true },
    orderBy: [{ fdi: "asc" }, { superficie: "asc" }],
  },
} satisfies Prisma.DiagnosticoSelect;

async function registrarAuditoria(
  tx: TenantTransaction,
  ctx: TenantContext,
  accion: string,
  diagnosticoId: string,
): Promise<void> {
  await tx.auditoria.create({
    data: {
      clinicaId: ctx.clinicaId,
      usuarioId: ctx.usuarioId,
      accion,
      entidad: "DIAGNOSTICO",
      entidadId: diagnosticoId,
    },
  });
}

async function expedienteDelPaciente(
  tx: TenantTransaction,
  ctx: TenantContext,
  pacienteId: string,
): Promise<string | null> {
  const expediente = await tx.expediente.findFirst({
    where: { pacienteId, clinicaId: ctx.clinicaId },
    select: { id: true },
  });
  return expediente?.id ?? null;
}

export async function crearDiagnostico(ctx: TenantContext, input: CrearDiagnosticoInput) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const expedienteId = await expedienteDelPaciente(tx, ctx, input.pacienteId);
    if (!expedienteId) return null;

    const diagnostico = await tx.diagnostico.create({
      data: {
        clinicaId: ctx.clinicaId,
        expedienteId,
        descripcion: input.descripcion,
        notas: input.notas,
        alcance: input.alcance,
        registradoPorId: ctx.membresiaId,
        dientes: {
          create: input.dientes.map((diente) => ({
            clinicaId: ctx.clinicaId,
            fdi: diente.fdi,
            superficie: diente.superficie,
          })),
        },
      },
      select: SELECT_DIAGNOSTICO,
    });
    await registrarAuditoria(tx, ctx, "DIAGNOSTICO_CREADO", diagnostico.id);
    return toDiagnosticoDto(diagnostico);
  });
}

/** Devuelve también los anulados: la historia clínica se muestra, no se esconde. */
export async function listarDiagnosticos(ctx: TenantContext, pacienteId: string) {
  requirePermiso(ctx, "clinico:read");
  return conTenant(ctx, async (tx) => {
    const expedienteId = await expedienteDelPaciente(tx, ctx, pacienteId);
    if (!expedienteId) return [];

    const diagnosticos = await tx.diagnostico.findMany({
      where: { clinicaId: ctx.clinicaId, expedienteId },
      select: SELECT_DIAGNOSTICO,
      orderBy: { creadoEn: "desc" },
      take: 100,
    });
    return diagnosticos.map(toDiagnosticoDto);
  });
}

/**
 * Anula con motivo. El diagnóstico sigue existiendo y visible como anulado:
 * la corrección clínica es registrar uno nuevo, nunca reescribir este.
 */
export async function anularDiagnostico(ctx: TenantContext, input: AnularDiagnosticoInput) {
  requirePermiso(ctx, "clinico:write");
  return conTenant(ctx, async (tx) => {
    const existente = await tx.diagnostico.findFirst({
      where: { id: input.diagnosticoId, clinicaId: ctx.clinicaId, anuladoEn: null },
      select: { id: true },
    });
    if (!existente) return null;

    const diagnostico = await tx.diagnostico.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: existente.id } },
      data: {
        anuladoEn: new Date(),
        anuladoPorId: ctx.membresiaId,
        motivoAnulacion: input.motivoAnulacion,
      },
      select: SELECT_DIAGNOSTICO,
    });
    await registrarAuditoria(tx, ctx, "DIAGNOSTICO_ANULADO", diagnostico.id);
    return toDiagnosticoDto(diagnostico);
  });
}
