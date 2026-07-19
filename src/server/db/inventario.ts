import "server-only";

import type { Prisma } from "./generated/client";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";
import {
  deltaDeMovimiento,
  type ActualizarMaterialInput,
  type CrearMaterialInput,
  type MovimientoInventarioInput,
} from "@/lib/validation/inventario";

import { moverStock } from "./raw/mover-stock";
import { conTenant, type TenantTransaction } from "./tenant";

const SELECT_MATERIAL = {
  id: true,
  nombre: true,
  unidad: true,
  stockActual: true,
  stockMinimo: true,
  costoUnitarioCentavos: true,
  activo: true,
} satisfies Prisma.MaterialSelect;

async function registrarAuditoria(
  tx: TenantTransaction,
  ctx: TenantContext,
  accion: string,
  materialId: string,
  detalle?: Prisma.InputJsonValue,
): Promise<void> {
  await tx.auditoria.create({
    data: {
      clinicaId: ctx.clinicaId,
      usuarioId: ctx.usuarioId,
      accion,
      entidad: "INVENTARIO",
      entidadId: materialId,
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
  if (sucursales.length > 1) throw new Error("Elegí una sede antes de operar el inventario.");
  return sucursales[0].id;
}

export async function listarMateriales(ctx: TenantContext) {
  requirePermiso(ctx, "inventario:read");
  return conTenant(ctx, async (tx) => {
    const materiales = await tx.material.findMany({
      where: { clinicaId: ctx.clinicaId },
      select: SELECT_MATERIAL,
      orderBy: { nombre: "asc" },
      take: 300,
    });
    return materiales.map((material) => ({
      ...material,
      // Derivado para la alerta: "en o por debajo del mínimo" (REGLAS §8).
      bajoMinimo: material.activo && material.stockActual <= material.stockMinimo,
    }));
  });
}

export async function getMaterialConHistorial(ctx: TenantContext, materialId: string) {
  requirePermiso(ctx, "inventario:read");
  return conTenant(ctx, async (tx) => {
    const material = await tx.material.findFirst({
      where: { id: materialId, clinicaId: ctx.clinicaId },
      select: {
        ...SELECT_MATERIAL,
        movimientos: {
          select: {
            id: true,
            tipo: true,
            cantidad: true,
            saldoDespues: true,
            motivo: true,
            creadoEn: true,
            registradoPor: { select: { usuario: { select: { nombre: true } } } },
          },
          orderBy: { creadoEn: "desc" },
          take: 100,
        },
      },
    });
    if (!material) return null;
    return {
      ...material,
      bajoMinimo: material.activo && material.stockActual <= material.stockMinimo,
      movimientos: material.movimientos.map((movimiento) => ({
        id: movimiento.id,
        tipo: movimiento.tipo,
        cantidad: movimiento.cantidad,
        saldoDespues: movimiento.saldoDespues,
        motivo: movimiento.motivo,
        creadoEn: movimiento.creadoEn.toISOString(),
        registradoPorNombre: movimiento.registradoPor.usuario.nombre,
      })),
    };
  });
}

/**
 * El stock inicial nace con su movimiento: si el material entra con 20 unidades,
 * el historial arranca explicando de dónde salieron esas 20.
 */
export async function crearMaterial(ctx: TenantContext, input: CrearMaterialInput) {
  requirePermiso(ctx, "inventario:write");
  return conTenant(ctx, async (tx) => {
    const material = await tx.material.create({
      data: {
        clinicaId: ctx.clinicaId,
        sucursalId: await sucursalPredeterminada(tx, ctx.clinicaId),
        nombre: input.nombre,
        unidad: input.unidad,
        stockActual: input.stockActual,
        stockMinimo: input.stockMinimo,
        costoUnitarioCentavos: input.costoUnitarioCentavos,
      },
      select: SELECT_MATERIAL,
    });

    if (input.stockActual > 0) {
      await tx.movimientoInventario.create({
        data: {
          clinicaId: ctx.clinicaId,
          materialId: material.id,
          tipo: "ENTRADA",
          cantidad: input.stockActual,
          saldoDespues: input.stockActual,
          motivo: "Stock inicial",
          registradoPorId: ctx.membresiaId,
        },
      });
    }
    await registrarAuditoria(tx, ctx, "MATERIAL_CREADO", material.id);
    return material;
  });
}

/** No toca el stock: eso solo se mueve con movimientos que dejan historia. */
export async function actualizarMaterial(ctx: TenantContext, input: ActualizarMaterialInput) {
  requirePermiso(ctx, "inventario:write");
  return conTenant(ctx, async (tx) => {
    const existente = await tx.material.findFirst({
      where: { id: input.materialId, clinicaId: ctx.clinicaId },
      select: { id: true },
    });
    if (!existente) return null;

    const material = await tx.material.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: existente.id } },
      data: {
        nombre: input.nombre,
        unidad: input.unidad,
        stockMinimo: input.stockMinimo,
        costoUnitarioCentavos: input.costoUnitarioCentavos,
        activo: input.activo,
      },
      select: SELECT_MATERIAL,
    });
    await registrarAuditoria(tx, ctx, "MATERIAL_ACTUALIZADO", material.id);
    return material;
  });
}

/**
 * Mueve el stock con un UPDATE atómico y toma el saldo del RETURNING (§13.3).
 * Si el movimiento dejaría el stock negativo, el CHECK de la base lo rechaza:
 * no hay verificación previa que dos salidas concurrentes puedan burlar.
 */
export async function registrarMovimiento(
  ctx: TenantContext,
  input: MovimientoInventarioInput,
) {
  requirePermiso(ctx, "inventario:write");
  return conTenant(ctx, async (tx) => {
    const material = await tx.material.findFirst({
      where: { id: input.materialId, clinicaId: ctx.clinicaId, activo: true },
      select: { id: true },
    });
    if (!material) return null;

    const delta = deltaDeMovimiento(input);
    const saldoDespues = await moverStock(tx, {
      clinicaId: ctx.clinicaId,
      materialId: material.id,
      delta,
    });
    if (saldoDespues === null) return null;

    const movimiento = await tx.movimientoInventario.create({
      data: {
        clinicaId: ctx.clinicaId,
        materialId: material.id,
        tipo: input.tipo,
        cantidad: delta,
        saldoDespues,
        motivo: input.motivo,
        registradoPorId: ctx.membresiaId,
      },
      select: { id: true },
    });
    await registrarAuditoria(tx, ctx, "INVENTARIO_MOVIMIENTO", material.id, {
      movimientoId: movimiento.id,
      tipo: input.tipo,
      cantidad: delta,
      saldoDespues,
    });
    return { movimientoId: movimiento.id, saldoDespues };
  });
}
