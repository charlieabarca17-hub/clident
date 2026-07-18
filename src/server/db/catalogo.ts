import "server-only";

import type { Prisma } from "./generated/client";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";
import {
  toCategoriaConTratamientosDto,
  toCategoriaDto,
  toTratamientoDto,
} from "@/server/dto/catalogo";
import type {
  ActualizarTratamientoInput,
  CrearTratamientoInput,
} from "@/lib/validation/catalogo";

import { conTenant, type TenantTransaction } from "./tenant";

const SELECT_TRATAMIENTO = {
  id: true,
  categoriaId: true,
  codigo: true,
  nombre: true,
  precioListaCentavos: true,
  activo: true,
  alcance: true,
  requiereDiente: true,
  permiteMultiplesDientes: true,
  permiteSuperficies: true,
  permiteMultiplesSuperficies: true,
  requiereDiagnostico: true,
  permiteMultiplesSesiones: true,
} satisfies Prisma.TratamientoSelect;

async function registrarAuditoria(
  tx: TenantTransaction,
  ctx: TenantContext,
  accion: string,
  entidadId: string | null,
  detalle?: Prisma.InputJsonValue,
): Promise<void> {
  await tx.auditoria.create({
    data: {
      clinicaId: ctx.clinicaId,
      usuarioId: ctx.usuarioId,
      accion,
      entidad: "CATALOGO",
      entidadId,
      detalle,
    },
  });
}

export async function listarCatalogo(ctx: TenantContext) {
  requirePermiso(ctx, "catalogo:read");
  return conTenant(ctx, async (tx) => {
    const categorias = await tx.categoriaTratamiento.findMany({
      where: { clinicaId: ctx.clinicaId },
      select: {
        id: true,
        nombre: true,
        orden: true,
        tratamientos: { select: SELECT_TRATAMIENTO, orderBy: { codigo: "asc" } },
      },
      orderBy: { orden: "asc" },
    });
    return categorias.map(toCategoriaConTratamientosDto);
  });
}

export async function listarCategorias(ctx: TenantContext) {
  requirePermiso(ctx, "catalogo:read");
  return conTenant(ctx, async (tx) => {
    const categorias = await tx.categoriaTratamiento.findMany({
      where: { clinicaId: ctx.clinicaId },
      select: { id: true, nombre: true, orden: true },
      orderBy: { orden: "asc" },
    });
    return categorias.map(toCategoriaDto);
  });
}

export async function getTratamiento(ctx: TenantContext, id: string) {
  requirePermiso(ctx, "catalogo:read");
  return conTenant(ctx, async (tx) => {
    const tratamiento = await tx.tratamiento.findFirst({
      where: { id, clinicaId: ctx.clinicaId },
      select: SELECT_TRATAMIENTO,
    });
    return tratamiento ? toTratamientoDto(tratamiento) : null;
  });
}

/**
 * Copia las plantillas globales al catálogo de la clínica. Es la ÚNICA vía de
 * inicialización: después de esto, el catálogo es propiedad de la clínica y las
 * plantillas no se vuelven a mirar (mismo criterio que los snapshots, ADR-006).
 *
 * Solo corre sobre un catálogo vacío: no mezcla ni "resincroniza" nunca.
 */
export async function clonarCatalogo(ctx: TenantContext) {
  requirePermiso(ctx, "catalogo:write");
  return conTenant(ctx, async (tx) => {
    const existentes = await tx.categoriaTratamiento.count({
      where: { clinicaId: ctx.clinicaId },
    });
    if (existentes > 0) {
      throw new Error("Esta clínica ya tiene catálogo; no se puede clonar encima.");
    }

    const plantillasCategoria = await tx.plantillaCategoria.findMany({
      orderBy: { orden: "asc" },
      select: { id: true, nombre: true, orden: true, plantillas: true },
    });
    if (plantillasCategoria.length === 0) {
      throw new Error(
        "No hay plantillas de catálogo sembradas. Corré `npm run seed:catalogo` primero.",
      );
    }

    let tratamientosCreados = 0;
    for (const plantilla of plantillasCategoria) {
      const categoria = await tx.categoriaTratamiento.create({
        data: {
          clinicaId: ctx.clinicaId,
          nombre: plantilla.nombre,
          orden: plantilla.orden,
        },
        select: { id: true },
      });
      for (const tratamiento of plantilla.plantillas) {
        await tx.tratamiento.create({
          data: {
            clinicaId: ctx.clinicaId,
            categoriaId: categoria.id,
            codigo: tratamiento.codigo,
            nombre: tratamiento.nombre,
            // El precio sugerido se copia como precio de lista inicial; desde
            // aquí, el precio es de la clínica y la plantilla deja de importar.
            precioListaCentavos: tratamiento.precioSugeridoCentavos,
            alcance: tratamiento.alcance,
            requiereDiente: tratamiento.requiereDiente,
            permiteMultiplesDientes: tratamiento.permiteMultiplesDientes,
            permiteSuperficies: tratamiento.permiteSuperficies,
            permiteMultiplesSuperficies: tratamiento.permiteMultiplesSuperficies,
            requiereDiagnostico: tratamiento.requiereDiagnostico,
            permiteMultiplesSesiones: tratamiento.permiteMultiplesSesiones,
          },
        });
        tratamientosCreados += 1;
      }
    }

    await registrarAuditoria(tx, ctx, "CATALOGO_CLONADO", null, {
      categorias: plantillasCategoria.length,
      tratamientos: tratamientosCreados,
    });
    return { categorias: plantillasCategoria.length, tratamientos: tratamientosCreados };
  });
}

export async function crearTratamiento(ctx: TenantContext, input: CrearTratamientoInput) {
  requirePermiso(ctx, "catalogo:write");
  return conTenant(ctx, async (tx) => {
    // La FK compuesta ya garantiza que la categoría sea de esta clínica; el
    // findFirst existe para responder NOT_FOUND legible en vez de un error de FK.
    const categoria = await tx.categoriaTratamiento.findFirst({
      where: { id: input.categoriaId, clinicaId: ctx.clinicaId },
      select: { id: true },
    });
    if (!categoria) {
      throw new Error("La categoría indicada no existe.");
    }

    const tratamiento = await tx.tratamiento.create({
      data: {
        clinicaId: ctx.clinicaId,
        categoriaId: categoria.id,
        codigo: input.codigo,
        nombre: input.nombre,
        precioListaCentavos: input.precioListaCentavos,
        alcance: input.alcance,
        requiereDiente: input.requiereDiente,
        permiteMultiplesDientes: input.permiteMultiplesDientes,
        permiteSuperficies: input.permiteSuperficies,
        permiteMultiplesSuperficies: input.permiteMultiplesSuperficies,
        requiereDiagnostico: input.requiereDiagnostico,
        permiteMultiplesSesiones: input.permiteMultiplesSesiones,
      },
      select: SELECT_TRATAMIENTO,
    });
    await registrarAuditoria(tx, ctx, "TRATAMIENTO_CREADO", tratamiento.id);
    return toTratamientoDto(tratamiento);
  });
}

/**
 * Edita nombre, precio de lista y bandera de activo. Nada más: código y banderas
 * de comportamiento son la identidad del tratamiento. Cambiar el precio NUNCA
 * toca planes existentes — ellos tienen su propio precio congelado (ADR-006).
 */
export async function actualizarTratamiento(
  ctx: TenantContext,
  id: string,
  input: ActualizarTratamientoInput,
) {
  requirePermiso(ctx, "catalogo:write");
  return conTenant(ctx, async (tx) => {
    const existente = await tx.tratamiento.findFirst({
      where: { id, clinicaId: ctx.clinicaId },
      select: { id: true, nombre: true, precioListaCentavos: true, activo: true },
    });
    if (!existente) return null;

    const tratamiento = await tx.tratamiento.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: existente.id } },
      data: {
        nombre: input.nombre,
        precioListaCentavos: input.precioListaCentavos,
        activo: input.activo,
      },
      select: SELECT_TRATAMIENTO,
    });
    await registrarAuditoria(tx, ctx, "TRATAMIENTO_ACTUALIZADO", tratamiento.id, {
      antes: {
        nombre: existente.nombre,
        precioListaCentavos: existente.precioListaCentavos,
        activo: existente.activo,
      },
      despues: {
        nombre: tratamiento.nombre,
        precioListaCentavos: tratamiento.precioListaCentavos,
        activo: tratamiento.activo,
      },
    });
    return toTratamientoDto(tratamiento);
  });
}
