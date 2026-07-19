import "server-only";

import type { Prisma } from "./generated/client";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";
import { hoyElSalvador } from "@/lib/fechas";
import type {
  AplicarPagoInput,
  CrearCalendarioCuotasInput,
  CrearCargoInput,
  RegistrarPagoInput,
} from "@/lib/validation/caja";

import { aplicarMontoACargo } from "./raw/aplicar-monto-cargo";
import { saldosDePaciente } from "./raw/saldos-paciente";
import { conTenant, type TenantTransaction } from "./tenant";

const SELECT_CARGO = {
  id: true,
  descripcion: true,
  montoCentavos: true,
  montoAplicadoCentavos: true,
  estado: true,
  fechaExigibleEn: true,
  planItemId: true,
  cuotaNumero: true,
  anuladoEn: true,
  motivoAnulacion: true,
  creadoEn: true,
  lineas: {
    select: {
      id: true,
      procedimientoId: true,
      descripcion: true,
      precioOriginalCentavos: true,
      descuentoCentavos: true,
      montoCentavos: true,
    },
    orderBy: { creadoEn: "asc" as const },
  },
} satisfies Prisma.CargoSelect;

const SELECT_PAGO = {
  id: true,
  montoCentavos: true,
  montoAplicadoCentavos: true,
  metodo: true,
  referencia: true,
  anuladoEn: true,
  motivoAnulacion: true,
  creadoEn: true,
  aplicaciones: {
    select: {
      id: true,
      cargoId: true,
      montoCentavos: true,
      reversaDeAplicacionId: true,
      motivoReversa: true,
      creadoEn: true,
    },
    orderBy: { creadoEn: "asc" as const },
  },
} satisfies Prisma.PagoSelect;

async function registrarAuditoria(
  tx: TenantTransaction,
  ctx: TenantContext,
  accion: string,
  entidadId: string,
  detalle?: Prisma.InputJsonValue,
): Promise<void> {
  await tx.auditoria.create({
    data: {
      clinicaId: ctx.clinicaId,
      usuarioId: ctx.usuarioId,
      accion,
      entidad: "CAJA",
      entidadId,
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
  if (sucursales.length > 1) throw new Error("Elegí una sede antes de operar en Caja.");
  return sucursales[0].id;
}

function fechaCivilADate(fecha: string): Date {
  // Mediodía UTC: el día civil no se corre en ningún huso razonable.
  return new Date(`${fecha}T12:00:00Z`);
}

type CrearCargoInterno = CrearCargoInput & {
  planItemId?: string | null;
  cuotaNumero?: number | null;
};

/**
 * El cuerpo real de crearCargo, dentro de una transacción ya abierta. Existe
 * para que el calendario de cuotas sea ATÓMICO (o nacen las 18 o ninguna)
 * llamando N veces a ESTA MISMA función — no a una variante.
 */
async function crearCargoEnTx(tx: TenantTransaction, ctx: TenantContext, input: CrearCargoInterno) {
    const paciente = await tx.paciente.findFirst({
      where: { id: input.pacienteId, clinicaId: ctx.clinicaId },
      select: { id: true },
    });
    if (!paciente) return null;

    // Las líneas con procedimiento validan y RECLAMAN el hecho clínico.
    const lineas: Array<{
      procedimientoId: string | null;
      descripcion: string;
      precioOriginalCentavos: number;
      descuentoCentavos: number;
      montoCentavos: number;
    }> = [];
    for (const linea of input.lineas) {
      if (linea.procedimientoId) {
        const procedimiento = await tx.procedimiento.findFirst({
          where: {
            id: linea.procedimientoId,
            clinicaId: ctx.clinicaId,
            pacienteId: paciente.id,
            estado: "REALIZADO",
          },
          select: { id: true, tratamientoNombre: true, precioAplicadoCentavos: true, cargoId: true },
        });
        if (!procedimiento) {
          throw new Error("Uno de los procedimientos no existe o no es cobrable.");
        }
        if (procedimiento.cargoId !== null) {
          throw new Error(`«${procedimiento.tratamientoNombre}» ya está cobrado en otro cargo.`);
        }
        lineas.push({
          procedimientoId: procedimiento.id,
          descripcion: linea.descripcion ?? procedimiento.tratamientoNombre,
          precioOriginalCentavos: linea.precioOriginalCentavos,
          descuentoCentavos: linea.descuentoCentavos,
          montoCentavos: linea.precioOriginalCentavos - linea.descuentoCentavos,
        });
      } else {
        lineas.push({
          procedimientoId: null,
          descripcion: linea.descripcion!,
          precioOriginalCentavos: linea.precioOriginalCentavos,
          descuentoCentavos: linea.descuentoCentavos,
          montoCentavos: linea.precioOriginalCentavos - linea.descuentoCentavos,
        });
      }
    }
    const montoTotal = lineas.reduce((suma, linea) => suma + linea.montoCentavos, 0);

    const creado = await tx.cargo.create({
      data: {
        clinicaId: ctx.clinicaId,
        pacienteId: paciente.id,
        sucursalId: await sucursalPredeterminada(tx, ctx.clinicaId),
        descripcion: input.descripcion,
        montoCentavos: montoTotal,
        fechaExigibleEn: fechaCivilADate(input.fechaExigibleEn),
        planItemId: input.planItemId ?? null,
        cuotaNumero: input.cuotaNumero ?? null,
        creadoPorId: ctx.membresiaId,
      },
      select: { id: true },
    });
    // Aparte y en lote: `clinicaId` participa en dos relaciones y Prisma no lo
    // acepta dentro de un create anidado (ver la nota en diagnosticos.ts).
    await tx.lineaCargo.createMany({
      data: lineas.map((linea) => ({ clinicaId: ctx.clinicaId, cargoId: creado.id, ...linea })),
    });
    const cargo = await tx.cargo.findFirstOrThrow({
      where: { id: creado.id, clinicaId: ctx.clinicaId },
      select: SELECT_CARGO,
    });

    // El reclamo atómico del doble cobro (ADR-016 #15): si otra transacción ya
    // reclamó el procedimiento, el updateMany no encuentra fila y se aborta todo.
    for (const linea of lineas) {
      if (!linea.procedimientoId) continue;
      const reclamadas = await tx.procedimiento.updateMany({
        where: { id: linea.procedimientoId, clinicaId: ctx.clinicaId, cargoId: null },
        data: { cargoId: cargo.id },
      });
      if (reclamadas.count !== 1) {
        throw new Error("Uno de los procedimientos acaba de cobrarse en otro cargo.");
      }
    }

    await registrarAuditoria(tx, ctx, "CARGO_CREADO", cargo.id, {
      montoCentavos: montoTotal,
      fechaExigibleEn: input.fechaExigibleEn,
      ...(input.cuotaNumero ? { cuotaNumero: input.cuotaNumero } : {}),
    });
    return cargo;
}

/**
 * LA ÚNICA VÍA de entrada a la cuenta por cobrar (ADR-007). La invoca un humano
 * con caja:write desde el módulo de Caja — nada más en el código la importa, y
 * no existe variante automática: las cuotas son esta misma lógica, N veces.
 */
export async function crearCargo(ctx: TenantContext, input: CrearCargoInterno) {
  requirePermiso(ctx, "caja:write");
  return conTenant(ctx, (tx) => crearCargoEnTx(tx, ctx, input));
}

/**
 * El calendario de cuotas (§1.9): N cargos con sus fechas EXPLÍCITAS, creados
 * por una persona de Caja en una acción aparte de la aceptación del plan.
 * Atómico: o nacen todas las cuotas o ninguna.
 */
export async function crearCalendarioCuotas(ctx: TenantContext, input: CrearCalendarioCuotasInput) {
  requirePermiso(ctx, "caja:write");
  return conTenant(ctx, async (tx) => {
    const planItem = await tx.planItem.findFirst({
      where: {
        id: input.planItemId,
        clinicaId: ctx.clinicaId,
        estado: { in: ["ACEPTADO", "EN_PROCESO", "COMPLETADO"] },
        plan: { estado: "ACEPTADO", pacienteId: input.pacienteId },
      },
      select: {
        id: true,
        tratamientoNombre: true,
        cargos: { where: { cuotaNumero: { not: null }, anuladoEn: null }, select: { id: true } },
      },
    });
    if (!planItem) {
      throw new Error("El tratamiento no pertenece a un plan aceptado de este paciente.");
    }
    // La unicidad [clinicaId, planItemId, cuotaNumero] respalda esto en la base.
    if (planItem.cargos.length > 0) {
      throw new Error("Este tratamiento ya tiene un calendario de cuotas vigente.");
    }

    let creados = 0;
    for (const [indice, fecha] of input.fechas.entries()) {
      const cargo = await crearCargoEnTx(tx, ctx, {
        pacienteId: input.pacienteId,
        descripcion: `Cuota ${indice + 1}/${input.fechas.length} · ${planItem.tratamientoNombre}`,
        fechaExigibleEn: fecha,
        lineas: [
          {
            procedimientoId: null,
            descripcion: `Cuota ${indice + 1} de ${input.fechas.length}`,
            precioOriginalCentavos: input.montoCuotaCentavos,
            descuentoCentavos: 0,
          },
        ],
        planItemId: planItem.id,
        cuotaNumero: indice + 1,
      });
      if (!cargo) throw new Error("No se pudo crear una de las cuotas.");
      creados += 1;
    }
    return { cargosCreados: creados };
  });
}

export async function registrarPago(ctx: TenantContext, input: RegistrarPagoInput) {
  requirePermiso(ctx, "caja:write");
  return conTenant(ctx, async (tx) => {
    const paciente = await tx.paciente.findFirst({
      where: { id: input.pacienteId, clinicaId: ctx.clinicaId },
      select: { id: true },
    });
    if (!paciente) return null;

    const pago = await tx.pago.create({
      data: {
        clinicaId: ctx.clinicaId,
        pacienteId: paciente.id,
        sucursalId: await sucursalPredeterminada(tx, ctx.clinicaId),
        montoCentavos: input.montoCentavos,
        metodo: input.metodo,
        referencia: input.referencia,
        creadoPorId: ctx.membresiaId,
      },
      select: SELECT_PAGO,
    });
    await registrarAuditoria(tx, ctx, "PAGO_REGISTRADO", pago.id, {
      montoCentavos: input.montoCentavos,
      metodo: input.metodo,
    });
    return pago;
  });
}

/**
 * Aplica dinero de un pago a un cargo. Mueve LOS DOS contadores en la misma
 * transacción, en el orden de bloqueo de §13.3: pagos primero, cargos después.
 * La sobreaplicación por cualquiera de los dos lados truena en su CHECK.
 * La distribución es decisión humana: nada se reparte solo (§12.6).
 */
export async function aplicarPago(ctx: TenantContext, input: AplicarPagoInput) {
  requirePermiso(ctx, "caja:write");
  return conTenant(ctx, async (tx) => {
    const [pago, cargo] = await Promise.all([
      tx.pago.findFirst({
        where: { id: input.pagoId, clinicaId: ctx.clinicaId, anuladoEn: null },
        select: { id: true },
      }),
      tx.cargo.findFirst({
        where: { id: input.cargoId, clinicaId: ctx.clinicaId, anuladoEn: null },
        select: { id: true },
      }),
    ]);
    if (!pago || !cargo) return null;

    // Orden de bloqueo §13.3: primero el pago, después el cargo.
    await tx.pago.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: pago.id } },
      data: { montoAplicadoCentavos: { increment: input.montoCentavos } },
      select: { id: true },
    });
    const filasCargo = await aplicarMontoACargo(tx, {
      clinicaId: ctx.clinicaId,
      cargoId: cargo.id,
      deltaCentavos: input.montoCentavos,
    });
    if (filasCargo !== 1) throw new Error("El cargo ya no está disponible.");

    const aplicacion = await tx.aplicacionPago.create({
      data: {
        clinicaId: ctx.clinicaId,
        pagoId: pago.id,
        cargoId: cargo.id,
        montoCentavos: input.montoCentavos,
        creadaPorId: ctx.membresiaId,
      },
      select: { id: true },
    });
    await registrarAuditoria(tx, ctx, "PAGO_APLICADO", aplicacion.id, {
      pagoId: pago.id,
      cargoId: cargo.id,
      montoCentavos: input.montoCentavos,
    });
    return { aplicacionId: aplicacion.id };
  });
}

/**
 * Reversa POR EL MONTO COMPLETO (§12.4): fila negativa amarrada a su original
 * por la FK quíntuple. "Eran $30 de los $50" = revertir los $50 y aplicar $30,
 * dos INSERT, rastro completo. Los contadores bajan con la misma maquinaria.
 */
export async function reversarAplicacion(ctx: TenantContext, aplicacionId: string, motivo: string) {
  requirePermiso(ctx, "caja:write");
  return conTenant(ctx, async (tx) => {
    const original = await tx.aplicacionPago.findFirst({
      where: {
        id: aplicacionId,
        clinicaId: ctx.clinicaId,
        reversaDeAplicacionId: null,
      },
      select: { id: true, pagoId: true, cargoId: true, montoCentavos: true },
    });
    if (!original) return null;

    // Verificar ANTES de tocar los contadores. El índice único impide la
    // segunda reversa, pero recién al insertar: sin este chequeo el decremento
    // ya ocurrió y el usuario ve una violación de CHECK en lugar de un rechazo
    // legible. (Detectado por la prueba de doble reversa contra PostgreSQL real.)
    const yaRevertida = await tx.aplicacionPago.findFirst({
      where: { clinicaId: ctx.clinicaId, reversaDeAplicacionId: original.id },
      select: { id: true },
    });
    if (yaRevertida) return null;

    // Orden §13.3: pago, luego cargo — el mismo de la aplicación.
    await tx.pago.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: original.pagoId } },
      data: { montoAplicadoCentavos: { decrement: original.montoCentavos } },
      select: { id: true },
    });
    await aplicarMontoACargo(tx, {
      clinicaId: ctx.clinicaId,
      cargoId: original.cargoId,
      deltaCentavos: -original.montoCentavos,
    });

    // La FK exige monto exactamente negado; el índice único parcial impide la
    // segunda reversa con 23505.
    const reversa = await tx.aplicacionPago.create({
      data: {
        clinicaId: ctx.clinicaId,
        pagoId: original.pagoId,
        cargoId: original.cargoId,
        montoCentavos: -original.montoCentavos,
        reversaDeAplicacionId: original.id,
        motivoReversa: motivo,
        creadaPorId: ctx.membresiaId,
      },
      select: { id: true },
    });
    await registrarAuditoria(tx, ctx, "APLICACION_REVERSADA", reversa.id, {
      aplicacionOriginal: original.id,
      motivo,
    });
    return { reversaId: reversa.id };
  });
}

/** Anular exige contador en 0 (CHECK): revertí las aplicaciones primero. Libera los procedimientos. */
export async function anularCargo(ctx: TenantContext, cargoId: string, motivo: string) {
  requirePermiso(ctx, "caja:write");
  return conTenant(ctx, async (tx) => {
    const cargo = await tx.cargo.findFirst({
      where: { id: cargoId, clinicaId: ctx.clinicaId, anuladoEn: null },
      select: { id: true, montoAplicadoCentavos: true },
    });
    if (!cargo) return null;
    if (cargo.montoAplicadoCentavos !== 0) {
      throw new Error("Este cargo tiene dinero aplicado: reversá las aplicaciones antes de anular.");
    }

    const anulado = await tx.cargo.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: cargo.id } },
      data: {
        estado: "ANULADO",
        anuladoEn: new Date(),
        anuladoPorId: ctx.membresiaId,
        motivoAnulacion: motivo,
      },
      select: { id: true },
    });
    // ADR-016 (#15): los procedimientos vuelven a ser cobrables.
    await tx.procedimiento.updateMany({
      where: { clinicaId: ctx.clinicaId, cargoId: cargo.id },
      data: { cargoId: null },
    });
    await registrarAuditoria(tx, ctx, "CARGO_ANULADO", anulado.id, { motivo });
    return anulado;
  });
}

export async function anularPago(ctx: TenantContext, pagoId: string, motivo: string) {
  requirePermiso(ctx, "caja:write");
  return conTenant(ctx, async (tx) => {
    const pago = await tx.pago.findFirst({
      where: { id: pagoId, clinicaId: ctx.clinicaId, anuladoEn: null },
      select: { id: true, montoAplicadoCentavos: true },
    });
    if (!pago) return null;
    if (pago.montoAplicadoCentavos !== 0) {
      throw new Error("Este pago tiene dinero aplicado: reversá las aplicaciones antes de anular.");
    }

    const anulado = await tx.pago.update({
      where: { clinicaId_id: { clinicaId: ctx.clinicaId, id: pago.id } },
      data: { anuladoEn: new Date(), anuladoPorId: ctx.membresiaId, motivoAnulacion: motivo },
      select: { id: true },
    });
    await registrarAuditoria(tx, ctx, "PAGO_ANULADO", anulado.id, { motivo });
    return anulado;
  });
}

export async function getEstadoCuenta(ctx: TenantContext, pacienteId: string) {
  requirePermiso(ctx, "caja:read");
  return conTenant(ctx, async (tx) => {
    const paciente = await tx.paciente.findFirst({
      where: { id: pacienteId, clinicaId: ctx.clinicaId },
      select: { id: true, nombres: true, apellidos: true },
    });
    if (!paciente) return null;

    const [saldos, cargos, pagos] = await Promise.all([
      saldosDePaciente(tx, {
        clinicaId: ctx.clinicaId,
        pacienteId: paciente.id,
        hoy: hoyElSalvador(),
      }),
      tx.cargo.findMany({
        where: { clinicaId: ctx.clinicaId, pacienteId: paciente.id },
        select: SELECT_CARGO,
        orderBy: [{ fechaExigibleEn: "asc" }, { creadoEn: "asc" }],
        take: 200,
      }),
      tx.pago.findMany({
        where: { clinicaId: ctx.clinicaId, pacienteId: paciente.id },
        select: SELECT_PAGO,
        orderBy: { creadoEn: "desc" },
        take: 200,
      }),
    ]);

    return {
      paciente,
      // bigint → number para la frontera de serialización: los saldos de un
      // paciente individual caben en Number sin pérdida (no son agregados de
      // reporte multi-paciente).
      saldos: {
        exigibleCentavos: Number(saldos.exigibleCentavos),
        vencidoCentavos: Number(saldos.vencidoCentavos),
        futuroCentavos: Number(saldos.futuroCentavos),
        totalCargadoCentavos: Number(saldos.totalCargadoCentavos),
        creditoAFavorCentavos: Number(saldos.creditoAFavorCentavos),
      },
      cargos: cargos.map((cargo) => ({
        ...cargo,
        fechaExigibleEn: cargo.fechaExigibleEn.toISOString().slice(0, 10),
        anuladoEn: cargo.anuladoEn?.toISOString() ?? null,
        creadoEn: cargo.creadoEn.toISOString(),
      })),
      pagos: pagos.map((pago) => ({
        ...pago,
        anuladoEn: pago.anuladoEn?.toISOString() ?? null,
        creadoEn: pago.creadoEn.toISOString(),
        aplicaciones: pago.aplicaciones.map((aplicacion) => ({
          ...aplicacion,
          creadoEn: aplicacion.creadoEn.toISOString(),
        })),
      })),
    };
  });
}

/**
 * La lista de trabajo de Caja: procedimientos realizados que un humano puede
 * decidir cobrar. Excluye los cubiertos por calendario de cuotas (ADR-016 #18):
 * la activación mensual de una ortodoncia con cuotas no debe cobrarse dos veces.
 */
export async function listarRealizadosSinCargo(ctx: TenantContext) {
  requirePermiso(ctx, "caja:read");
  return conTenant(ctx, async (tx) => {
    const procedimientos = await tx.procedimiento.findMany({
      where: {
        clinicaId: ctx.clinicaId,
        estado: "REALIZADO",
        cargoId: null,
        planItem: {
          cargos: { none: { cuotaNumero: { not: null }, anuladoEn: null } },
        },
      },
      select: {
        id: true,
        pacienteId: true,
        tratamientoNombre: true,
        precioAplicadoCentavos: true,
        realizadoEn: true,
        paciente: { select: { nombres: true, apellidos: true } },
      },
      orderBy: { realizadoEn: "asc" },
      take: 200,
    });
    return procedimientos.map((procedimiento) => ({
      id: procedimiento.id,
      pacienteId: procedimiento.pacienteId,
      pacienteNombre: `${procedimiento.paciente.nombres} ${procedimiento.paciente.apellidos}`,
      tratamientoNombre: procedimiento.tratamientoNombre,
      precioAplicadoCentavos: procedimiento.precioAplicadoCentavos,
      realizadoEn: procedimiento.realizadoEn.toISOString(),
    }));
  });
}
