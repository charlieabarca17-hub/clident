import "server-only";

import type { Prisma } from "./generated/client";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";
import {
  toPacienteAdministrativoDto,
  toPacienteDetalleDto,
  toPacienteListadoDto,
} from "@/server/dto/pacientes";
import type { CrearPacienteInput } from "@/lib/validation/pacientes";

import { conTenant, type TenantTransaction } from "./tenant";

const SELECT_LISTADO = {
  id: true,
  nombres: true,
  apellidos: true,
  fechaNacimiento: true,
  telefono: true,
  duiEnmascarado: true,
} satisfies Prisma.PacienteSelect;

const SELECT_DETALLE = {
  ...SELECT_LISTADO,
  dui: true,
  correo: true,
  direccion: true,
  responsableNombre: true,
  responsableTipoDocumento: true,
  responsableNumDocumento: true,
  responsableTelefono: true,
  responsableParentesco: true,
  contactoEmergenciaNombre: true,
  contactoEmergenciaTelefono: true,
} satisfies Prisma.PacienteSelect;

// La ficha administrativa sirve a recepción. Deliberadamente no selecciona
// `dui` ni `responsableNumDocumento`: la UI no puede filtrar una columna que
// este selector nunca pidió a PostgreSQL.
const SELECT_EXPEDIENTE_ADMINISTRATIVO = {
  ...SELECT_LISTADO,
  correo: true,
  direccion: true,
  responsableNombre: true,
  responsableTelefono: true,
  responsableParentesco: true,
  contactoEmergenciaNombre: true,
  contactoEmergenciaTelefono: true,
} satisfies Prisma.PacienteSelect;

async function registrarAuditoria(
  tx: TenantTransaction,
  ctx: TenantContext,
  accion: string,
  pacienteId: string,
): Promise<void> {
  await tx.auditoria.create({
    data: {
      clinicaId: ctx.clinicaId,
      usuarioId: ctx.usuarioId,
      accion,
      entidad: "PACIENTE",
      entidadId: pacienteId,
    },
  });
}

function datosParaCrear(input: CrearPacienteInput) {
  return {
    nombres: input.nombres,
    apellidos: input.apellidos,
    fechaNacimiento: input.fechaNacimiento,
    dui: input.dui,
    telefono: input.telefono,
    correo: input.correo,
    direccion: input.direccion,
    responsableNombre: input.responsable?.nombre ?? null,
    responsableTipoDocumento: input.responsable?.tipoDocumento ?? null,
    responsableNumDocumento: input.responsable?.numeroDocumento ?? null,
    responsableTelefono: input.responsable?.telefono ?? null,
    responsableParentesco: input.responsable?.parentesco ?? null,
    contactoEmergenciaNombre: input.contactoEmergencia.nombre,
    contactoEmergenciaTelefono: input.contactoEmergencia.telefono,
  };
}

export async function crearPaciente(ctx: TenantContext, input: CrearPacienteInput) {
  requirePermiso(ctx, "paciente:write");
  return conTenant(ctx, async (tx) => {
    const paciente = await tx.paciente.create({
      data: { clinicaId: ctx.clinicaId, ...datosParaCrear(input) },
      select: SELECT_LISTADO,
    });
    // El expediente no tiene contenido clínico todavía, pero nace junto al paciente:
    // ninguna alerta ni módulo clínico futuro puede quedar apuntando a un paciente sin ficha.
    await tx.expediente.create({
      data: { clinicaId: ctx.clinicaId, pacienteId: paciente.id },
    });
    await registrarAuditoria(tx, ctx, "PACIENTE_CREADO", paciente.id);
    return toPacienteListadoDto(paciente);
  });
}

export async function listarPacientes(ctx: TenantContext) {
  requirePermiso(ctx, "paciente:read");
  return conTenant(ctx, async (tx) => {
    const pacientes = await tx.paciente.findMany({
      where: { clinicaId: ctx.clinicaId },
      select: SELECT_LISTADO,
      orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
      take: 50,
    });
    return pacientes.map(toPacienteListadoDto);
  });
}

export async function buscarPacientes(ctx: TenantContext, termino: string) {
  requirePermiso(ctx, "paciente:read");
  const busqueda = termino.trim();
  if (busqueda.length < 2) return [];

  return conTenant(ctx, async (tx) => {
    const pacientes = await tx.paciente.findMany({
      where: {
        clinicaId: ctx.clinicaId,
        OR: [
          { nombres: { contains: busqueda, mode: "insensitive" } },
          { apellidos: { contains: busqueda, mode: "insensitive" } },
          { telefono: { contains: busqueda } },
          { dui: { contains: busqueda } },
          { responsableTelefono: { contains: busqueda } },
        ],
      },
      select: SELECT_LISTADO,
      orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
      take: 20,
    });
    return pacientes.map(toPacienteListadoDto);
  });
}

/** Selector de Agenda: devuelve lo mismo que un listado, nunca PII completa. */
export async function getPacienteParaAgenda(ctx: TenantContext, id: string) {
  requirePermiso(ctx, "paciente:read");
  return conTenant(ctx, async (tx) => {
    const paciente = await tx.paciente.findFirst({
      where: { id, clinicaId: ctx.clinicaId },
      select: SELECT_LISTADO,
    });
    return paciente ? toPacienteListadoDto(paciente) : null;
  });
}

/**
 * Ficha que ve cualquier rol con paciente:read. La lectura PII queda separada
 * abajo para que verla sea una decisión explícita y auditable.
 */
export async function getPacienteAdministrativo(ctx: TenantContext, id: string) {
  requirePermiso(ctx, "paciente:read");
  return conTenant(ctx, async (tx) => {
    const paciente = await tx.paciente.findFirst({
      where: { id, clinicaId: ctx.clinicaId },
      select: SELECT_EXPEDIENTE_ADMINISTRATIVO,
    });
    return paciente ? toPacienteAdministrativoDto(paciente) : null;
  });
}

/** La única lectura que recibe el DUI completo; registra quién la realizó y cuándo. */
export async function getPacienteDetalle(ctx: TenantContext, id: string) {
  requirePermiso(ctx, "paciente:read_pii");
  return conTenant(ctx, async (tx) => {
    const paciente = await tx.paciente.findFirst({
      where: { id, clinicaId: ctx.clinicaId },
      select: SELECT_DETALLE,
    });
    if (!paciente) return null;
    await registrarAuditoria(tx, ctx, "PACIENTE_PII_CONSULTADO", paciente.id);
    return toPacienteDetalleDto(paciente);
  });
}
