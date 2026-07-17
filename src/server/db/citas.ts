import "server-only";

import type { Prisma } from "./generated/client";
import { ErrorAgendaSucursal, ErrorAgendaTraslape, esExclusionDeCita } from "@/lib/errors";
import { fechaHoraElSalvador } from "@/lib/validation/citas";
import type { CrearCitaInput, ReprogramarCitaInput } from "@/lib/validation/citas";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";
import { toCitaAgendaDto } from "@/server/dto/citas";

import { conTenant, type TenantTransaction } from "./tenant";

const SELECT_CITA_AGENDA = {
  id: true,
  inicioEn: true,
  finEn: true,
  estado: true,
  motivo: true,
  notasAdministrativas: true,
  paciente: { select: { id: true, nombres: true, apellidos: true } },
  odontologo: {
    select: {
      id: true,
      colorAgenda: true,
      usuario: { select: { nombre: true } },
    },
  },
} satisfies Prisma.CitaSelect;

async function registrarAuditoria(
  tx: TenantTransaction,
  ctx: TenantContext,
  accion: string,
  citaId: string,
): Promise<void> {
  await tx.auditoria.create({
    data: {
      clinicaId: ctx.clinicaId,
      usuarioId: ctx.usuarioId,
      accion,
      entidad: "CITA",
      entidadId: citaId,
    },
  });
}

function errorTraslape(error: unknown): ErrorAgendaTraslape | null {
  if (esExclusionDeCita(error, "citas_sin_traslape")) {
    return new ErrorAgendaTraslape("El odontólogo seleccionado ya tiene una cita en ese horario.");
  }
  if (esExclusionDeCita(error, "citas_paciente_sin_traslape")) {
    return new ErrorAgendaTraslape("El paciente ya tiene una cita en ese horario.");
  }
  return null;
}

async function sucursalPredeterminada(tx: TenantTransaction, clinicaId: string): Promise<string> {
  const sucursales = await tx.sucursal.findMany({
    where: { clinicaId },
    select: { id: true },
    orderBy: { creadoEn: "asc" },
    take: 2,
  });
  if (sucursales.length === 0) throw new Error("La clínica no tiene una sucursal disponible.");
  // La UI de sucursales no entra en este MVP. Elegir "la primera" con dos sedes
  // registraría un hecho administrativo falso; esa fase deberá mostrar un selector.
  if (sucursales.length > 1) throw new ErrorAgendaSucursal();
  return sucursales[0].id;
}

async function validarReferencias(
  tx: TenantTransaction,
  ctx: TenantContext,
  input: Pick<CrearCitaInput, "pacienteId" | "odontologoId">,
): Promise<void> {
  const [paciente, odontologo] = await Promise.all([
    tx.paciente.findFirst({
      where: { id: input.pacienteId, clinicaId: ctx.clinicaId },
      select: { id: true },
    }),
    tx.membresia.findFirst({
      where: {
        id: input.odontologoId,
        clinicaId: ctx.clinicaId,
        activa: true,
        roles: { has: "ODONTOLOGO" },
      },
      select: { id: true },
    }),
  ]);
  if (!paciente || !odontologo) {
    // No revela si el ID inexistente pertenece a otra clínica.
    throw new Error("El paciente o el odontólogo seleccionado ya no está disponible.");
  }
}

export async function listarOdontologosAgenda(ctx: TenantContext) {
  requirePermiso(ctx, "agenda:read");
  return conTenant(ctx, async (tx) => {
    const odontologos = await tx.membresia.findMany({
      where: { clinicaId: ctx.clinicaId, activa: true, roles: { has: "ODONTOLOGO" } },
      select: { id: true, colorAgenda: true, usuario: { select: { nombre: true } } },
      orderBy: { usuario: { nombre: "asc" } },
    });
    return odontologos.map((odontologo) => ({
      id: odontologo.id,
      nombre: odontologo.usuario.nombre,
      colorAgenda: odontologo.colorAgenda,
    }));
  });
}

export async function listarCitasDia(
  ctx: TenantContext,
  fecha: string,
  odontologoId?: string,
) {
  requirePermiso(ctx, "agenda:read");
  const inicioDia = fechaHoraElSalvador(fecha, "00:00");
  const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1_000);
  return conTenant(ctx, async (tx) => {
    const citas = await tx.cita.findMany({
      where: {
        clinicaId: ctx.clinicaId,
        AND: [
          { inicioEn: { lt: finDia } },
          { finEn: { gt: inicioDia } },
        ],
        ...(odontologoId ? { odontologoId } : {}),
      },
      select: SELECT_CITA_AGENDA,
      orderBy: { inicioEn: "asc" },
    });
    return citas.map(toCitaAgendaDto);
  });
}

/** Las citas del paciente se muestran en su ficha, siempre bajo la misma clínica activa. */
export async function listarCitasPaciente(ctx: TenantContext, pacienteId: string) {
  requirePermiso(ctx, "agenda:read");
  return conTenant(ctx, async (tx) => {
    const citas = await tx.cita.findMany({
      where: { clinicaId: ctx.clinicaId, pacienteId },
      select: SELECT_CITA_AGENDA,
      orderBy: { inicioEn: "desc" },
      take: 20,
    });
    return citas.map(toCitaAgendaDto);
  });
}

export async function crearCita(ctx: TenantContext, input: CrearCitaInput) {
  requirePermiso(ctx, "agenda:write");
  try {
    return await conTenant(ctx, async (tx) => {
      await validarReferencias(tx, ctx, input);
      const cita = await tx.cita.create({
        data: {
          clinicaId: ctx.clinicaId,
          sucursalId: await sucursalPredeterminada(tx, ctx.clinicaId),
          pacienteId: input.pacienteId,
          odontologoId: input.odontologoId,
          inicioEn: input.inicioEn,
          finEn: input.finEn,
          motivo: input.motivo,
          notasAdministrativas: input.notasAdministrativas,
        },
        select: SELECT_CITA_AGENDA,
      });
      await registrarAuditoria(tx, ctx, "CITA_CREADA", cita.id);
      return toCitaAgendaDto(cita);
    });
  } catch (error) {
    const conflicto = errorTraslape(error);
    if (conflicto) throw conflicto;
    throw error;
  }
}

export async function cancelarCita(ctx: TenantContext, citaId: string) {
  requirePermiso(ctx, "agenda:write");
  return conTenant(ctx, async (tx) => {
    const existente = await tx.cita.findFirst({
      where: { id: citaId, clinicaId: ctx.clinicaId },
      select: { id: true, estado: true },
    });
    if (!existente) return null;
    if (existente.estado === "CANCELADA") return null;
    const cita = await tx.cita.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: existente.id } },
      data: { estado: "CANCELADA" },
      select: SELECT_CITA_AGENDA,
    });
    await registrarAuditoria(tx, ctx, "CITA_CANCELADA", cita.id);
    return toCitaAgendaDto(cita);
  });
}

export async function reprogramarCita(
  ctx: TenantContext,
  citaId: string,
  input: ReprogramarCitaInput,
) {
  requirePermiso(ctx, "agenda:write");
  try {
    return await conTenant(ctx, async (tx) => {
      const existente = await tx.cita.findFirst({
        where: { id: citaId, clinicaId: ctx.clinicaId, estado: "PENDIENTE" },
        select: { id: true },
      });
      if (!existente) return null;
      const cita = await tx.cita.update({
        where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: existente.id } },
        data: { inicioEn: input.inicioEn, finEn: input.finEn },
        select: SELECT_CITA_AGENDA,
      });
      await registrarAuditoria(tx, ctx, "CITA_REPROGRAMADA", cita.id);
      return toCitaAgendaDto(cita);
    });
  } catch (error) {
    const conflicto = errorTraslape(error);
    if (conflicto) throw conflicto;
    throw error;
  }
}
