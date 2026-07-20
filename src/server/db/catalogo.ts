import "server-only";

import { randomUUID } from "node:crypto";

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
  PreferenciaTratamientoInput,
} from "@/lib/validation/catalogo";

import { conTenant, type TenantTransaction } from "./tenant";

function selectTratamiento(membresiaId: string) {
  return {
    id: true,
    categoriaId: true,
    codigo: true,
    nombre: true,
    activo: true,
    alcance: true,
    requiereDiente: true,
    permiteMultiplesDientes: true,
    permiteSuperficies: true,
    permiteMultiplesSuperficies: true,
    requiereDiagnostico: true,
    permiteMultiplesSesiones: true,
    plantilla: { select: { nombre: true } },
    preferencias: {
      where: { membresiaId },
      select: { alias: true, favorito: true },
      take: 1,
    },
  } satisfies Prisma.TratamientoSelect;
}

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
        tratamientos: {
          select: selectTratamiento(ctx.membresiaId),
          orderBy: { codigo: "asc" },
        },
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
      select: selectTratamiento(ctx.membresiaId),
    });
    return tratamiento ? toTratamientoDto(tratamiento) : null;
  });
}

/**
 * Utilidad interna para pruebas y datos de demostración. La interfaz real agrega
 * referencias una por una y nunca impone un catálogo completo.
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

    // Dos inserciones masivas, no 106 individuales. Contra una base en la nube
    // cada viaje cuesta decenas de milisegundos: fila por fila, clonar 12
    // categorías y ~94 tratamientos supera el límite de tiempo de la
    // transacción y el usuario ve un error al inicializar su catálogo.
    // (Detectado al correr contra Neon real: la transacción tardaba 5.7 s.)
    //
    // Los ids se generan acá para poder relacionar cada tratamiento con su
    // categoría sin releer la tabla: createMany no devuelve lo que insertó.
    const categorias = plantillasCategoria.map((plantilla) => ({
      id: randomUUID(),
      clinicaId: ctx.clinicaId,
      nombre: plantilla.nombre,
      orden: plantilla.orden,
    }));
    await tx.categoriaTratamiento.createMany({ data: categorias });

    const idPorPlantilla = new Map(
      plantillasCategoria.map((plantilla, indice) => [plantilla.id, categorias[indice].id]),
    );
    const tratamientos = plantillasCategoria.flatMap((plantilla) =>
      plantilla.plantillas.map((tratamiento) => ({
        id: randomUUID(),
        clinicaId: ctx.clinicaId,
        categoriaId: idPorPlantilla.get(plantilla.id)!,
        codigo: tratamiento.codigo,
        nombre: tratamiento.nombre,
        plantillaCodigo: tratamiento.codigo,
        alcance: tratamiento.alcance,
        requiereDiente: tratamiento.requiereDiente,
        permiteMultiplesDientes: tratamiento.permiteMultiplesDientes,
        permiteSuperficies: tratamiento.permiteSuperficies,
        permiteMultiplesSuperficies: tratamiento.permiteMultiplesSuperficies,
        requiereDiagnostico: tratamiento.requiereDiagnostico,
        permiteMultiplesSesiones: tratamiento.permiteMultiplesSesiones,
      })),
    );
    await tx.tratamiento.createMany({ data: tratamientos });
    const tratamientosCreados = tratamientos.length;

    await registrarAuditoria(tx, ctx, "CATALOGO_CLONADO", null, {
      categorias: plantillasCategoria.length,
      tratamientos: tratamientosCreados,
    });
    return { categorias: plantillasCategoria.length, tratamientos: tratamientosCreados };
  });
}

export async function listarReferenciasCatalogo(ctx: TenantContext, busqueda = "") {
  requirePermiso(ctx, "catalogo:read");
  const termino = busqueda.trim();
  return conTenant(ctx, async (tx) => {
    const categorias = await tx.plantillaCategoria.findMany({
      orderBy: { orden: "asc" },
      select: {
        id: true,
        nombre: true,
        orden: true,
        plantillas: {
          where: {
            tratamientosClinica: { none: { clinicaId: ctx.clinicaId } },
            ...(termino
              ? {
                  OR: [
                    { codigo: { contains: termino, mode: "insensitive" as const } },
                    { nombre: { contains: termino, mode: "insensitive" as const } },
                  ],
                }
              : {}),
          },
          orderBy: { codigo: "asc" },
          select: {
            codigo: true,
            nombre: true,
            alcance: true,
            requiereDiente: true,
            permiteMultiplesSesiones: true,
          },
        },
      },
    });
    return categorias.filter((categoria) => categoria.plantillas.length > 0);
  });
}

export async function agregarReferenciaCatalogo(ctx: TenantContext, codigo: string) {
  requirePermiso(ctx, "catalogo:write");
  return conTenant(ctx, async (tx) => {
    const referencia = await tx.plantillaTratamiento.findUnique({
      where: { codigo },
      select: {
        codigo: true,
        nombre: true,
        alcance: true,
        requiereDiente: true,
        permiteMultiplesDientes: true,
        permiteSuperficies: true,
        permiteMultiplesSuperficies: true,
        requiereDiagnostico: true,
        permiteMultiplesSesiones: true,
        categoria: { select: { nombre: true, orden: true } },
      },
    });
    if (!referencia) throw new Error("El tratamiento de referencia ya no existe.");

    const existente = await tx.tratamiento.findUnique({
      where: { clinicaId_codigo: { clinicaId: ctx.clinicaId, codigo: referencia.codigo } },
      select: { id: true },
    });
    if (existente) return getTratamientoInterno(tx, ctx, existente.id);

    const categoria = await tx.categoriaTratamiento.upsert({
      where: {
        clinicaId_nombre: { clinicaId: ctx.clinicaId, nombre: referencia.categoria.nombre },
      },
      update: {},
      create: {
        clinicaId: ctx.clinicaId,
        nombre: referencia.categoria.nombre,
        orden: referencia.categoria.orden,
      },
      select: { id: true },
    });
    const tratamiento = await tx.tratamiento.create({
      data: {
        clinicaId: ctx.clinicaId,
        categoriaId: categoria.id,
        plantillaCodigo: referencia.codigo,
        codigo: referencia.codigo,
        nombre: referencia.nombre,
        alcance: referencia.alcance,
        requiereDiente: referencia.requiereDiente,
        permiteMultiplesDientes: referencia.permiteMultiplesDientes,
        permiteSuperficies: referencia.permiteSuperficies,
        permiteMultiplesSuperficies: referencia.permiteMultiplesSuperficies,
        requiereDiagnostico: referencia.requiereDiagnostico,
        permiteMultiplesSesiones: referencia.permiteMultiplesSesiones,
      },
      select: selectTratamiento(ctx.membresiaId),
    });
    await registrarAuditoria(tx, ctx, "REFERENCIA_AGREGADA", tratamiento.id, {
      codigo: referencia.codigo,
    });
    return toTratamientoDto(tratamiento);
  });
}

async function getTratamientoInterno(tx: TenantTransaction, ctx: TenantContext, id: string) {
  const tratamiento = await tx.tratamiento.findFirst({
    where: { id, clinicaId: ctx.clinicaId },
    select: selectTratamiento(ctx.membresiaId),
  });
  return tratamiento ? toTratamientoDto(tratamiento) : null;
}

export async function guardarPreferenciaTratamiento(
  ctx: TenantContext,
  tratamientoId: string,
  input: PreferenciaTratamientoInput,
) {
  requirePermiso(ctx, "catalogo:read");
  return conTenant(ctx, async (tx) => {
    const tratamiento = await tx.tratamiento.findFirst({
      where: { id: tratamientoId, clinicaId: ctx.clinicaId },
      select: { id: true },
    });
    if (!tratamiento) return null;
    await tx.preferenciaTratamiento.upsert({
      where: {
        clinicaId_membresiaId_tratamientoId: {
          clinicaId: ctx.clinicaId,
          membresiaId: ctx.membresiaId,
          tratamientoId,
        },
      },
      update: { alias: input.alias, favorito: input.favorito },
      create: {
        clinicaId: ctx.clinicaId,
        membresiaId: ctx.membresiaId,
        tratamientoId,
        alias: input.alias,
        favorito: input.favorito,
      },
    });
    await registrarAuditoria(tx, ctx, "PREFERENCIA_TRATAMIENTO_ACTUALIZADA", tratamientoId, {
      alias: input.alias,
      favorito: input.favorito,
    });
    return getTratamientoInterno(tx, ctx, tratamientoId);
  });
}

export async function crearTratamiento(ctx: TenantContext, input: CrearTratamientoInput) {
  requirePermiso(ctx, "catalogo:write");
  return conTenant(ctx, async (tx) => {
    const categoriaExistente = await tx.categoriaTratamiento.findUnique({
      where: {
        clinicaId_nombre: { clinicaId: ctx.clinicaId, nombre: input.categoriaNombre },
      },
      select: { id: true },
    });
    const categoria = categoriaExistente ?? await tx.categoriaTratamiento.create({
      data: {
        clinicaId: ctx.clinicaId,
        nombre: input.categoriaNombre,
        orden: ((await tx.categoriaTratamiento.aggregate({
          where: { clinicaId: ctx.clinicaId },
          _max: { orden: true },
        }))._max.orden ?? 0) + 1,
      },
      select: { id: true },
    });

    const tratamiento = await tx.tratamiento.create({
      data: {
        clinicaId: ctx.clinicaId,
        categoriaId: categoria.id,
        codigo: input.codigo,
        nombre: input.nombre,
        alcance: input.alcance,
        requiereDiente: input.requiereDiente,
        permiteMultiplesDientes: input.permiteMultiplesDientes,
        permiteSuperficies: input.permiteSuperficies,
        permiteMultiplesSuperficies: input.permiteMultiplesSuperficies,
        requiereDiagnostico: input.requiereDiagnostico,
        permiteMultiplesSesiones: input.permiteMultiplesSesiones,
      },
      select: selectTratamiento(ctx.membresiaId),
    });
    await registrarAuditoria(tx, ctx, "TRATAMIENTO_CREADO", tratamiento.id);
    return toTratamientoDto(tratamiento);
  });
}

/**
 * Edita el nombre que utiliza la clínica y la disponibilidad. Código y banderas
 * de comportamiento siguen definiendo la identidad del tratamiento.
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
      select: { id: true, nombre: true, activo: true },
    });
    if (!existente) return null;

    const tratamiento = await tx.tratamiento.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: existente.id } },
      data: {
        nombre: input.nombre,
        activo: input.activo,
      },
      select: selectTratamiento(ctx.membresiaId),
    });
    await registrarAuditoria(tx, ctx, "TRATAMIENTO_ACTUALIZADO", tratamiento.id, {
      antes: {
        nombre: existente.nombre,
        activo: existente.activo,
      },
      despues: {
        nombre: tratamiento.nombre,
        activo: tratamiento.activo,
      },
    });
    return toTratamientoDto(tratamiento);
  });
}
