import "server-only";

import type { Prisma } from "./generated/client";
import type { TenantContext } from "@/server/auth/types";
import { requirePermiso } from "@/server/auth/permissions";
import { hoyElSalvador } from "@/lib/fechas";
import type {
  AplicarPagoInput,
  CrearCalendarioCuotasInput,
  CrearCargoDePlanInput,
  CrearCargoInput,
  RegistrarPagoInput,
} from "@/lib/validation/caja";

import { aplicarMontoACargo } from "./raw/aplicar-monto-cargo";
import { bloquearPlanItemParaCaja } from "./raw/bloquear-plan-item-caja";
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

    // Desde ADR-017 una línea nueva nunca cobra una sesión. Los
    // procedimientoId históricos se conservan únicamente para lectura.
    const lineas: Array<{
      procedimientoId: string | null;
      descripcion: string;
      precioOriginalCentavos: number;
      descuentoCentavos: number;
      montoCentavos: number;
    }> = [];
    for (const linea of input.lineas) {
      if (linea.procedimientoId !== null) {
        throw new Error(
          "Los tratamientos planificados se cobran por PlanItem; no se cobra una sesión por separado.",
        );
      }
      lineas.push({
        procedimientoId: null,
        descripcion: linea.descripcion!,
        precioOriginalCentavos: linea.precioOriginalCentavos,
        descuentoCentavos: linea.descuentoCentavos,
        montoCentavos: linea.precioOriginalCentavos - linea.descuentoCentavos,
      });
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
 * Crea cargos libres desde Caja (ADR-007). Los tratamientos de un plan usan
 * crearCargoDePlan o crearCalendarioCuotas para conservar una sola unidad de cobro.
 */
export async function crearCargo(ctx: TenantContext, input: CrearCargoInput) {
  requirePermiso(ctx, "caja:write");
  if (input.lineas.some((linea) => linea.procedimientoId !== null)) {
    throw new Error(
      "Los tratamientos planificados se cobran por PlanItem; no se cobra una sesión por separado.",
    );
  }
  return conTenant(ctx, (tx) => crearCargoEnTx(tx, ctx, input));
}

/**
 * Cobra el tratamiento del plan una sola vez, por el total que fijó el
 * odontólogo para este paciente. Al menos una sesión debe haberse realizado;
 * la creación sigue siendo una decisión humana y separada de Caja (ADR-007).
 */
export async function crearCargoDePlan(ctx: TenantContext, input: CrearCargoDePlanInput) {
  requirePermiso(ctx, "caja:write");
  return conTenant(ctx, async (tx) => {
    if (
      !(await bloquearPlanItemParaCaja(tx, {
        clinicaId: ctx.clinicaId,
        planItemId: input.planItemId,
      }))
    ) {
      return null;
    }

    const planItem = await tx.planItem.findFirst({
      where: {
        id: input.planItemId,
        clinicaId: ctx.clinicaId,
        estado: { in: ["ACEPTADO", "EN_PROCESO", "COMPLETADO"] },
        plan: { estado: "ACEPTADO", pacienteId: input.pacienteId },
        procedimientos: { some: { estado: "REALIZADO" } },
      },
      select: {
        id: true,
        tratamientoNombre: true,
        precioUnitarioCentavos: true,
        descuentoCentavos: true,
        cargos: { where: { anuladoEn: null }, select: { id: true }, take: 1 },
        procedimientos: {
          where: { estado: "REALIZADO", cargoId: { not: null } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!planItem) {
      throw new Error("El tratamiento no pertenece a un plan aceptado o todavía no se realizó.");
    }
    if (planItem.cargos.length > 0) {
      throw new Error("Este tratamiento ya tiene un cobro vigente, único o por cuotas.");
    }
    // Compatibilidad con cargos históricos creados por sesión antes del ADR-017.
    if (planItem.procedimientos.length > 0) {
      throw new Error("Este tratamiento ya fue cobrado por el flujo anterior de sesiones.");
    }

    const totalCentavos = planItem.precioUnitarioCentavos - planItem.descuentoCentavos;
    if (totalCentavos <= 0) {
      throw new Error("Este tratamiento no tiene un monto positivo pendiente de cobro.");
    }

    return crearCargoEnTx(tx, ctx, {
      pacienteId: input.pacienteId,
      descripcion: `Tratamiento · ${planItem.tratamientoNombre}`,
      fechaExigibleEn: input.fechaExigibleEn,
      lineas: [
        {
          procedimientoId: null,
          descripcion: planItem.tratamientoNombre,
          precioOriginalCentavos: planItem.precioUnitarioCentavos,
          descuentoCentavos: planItem.descuentoCentavos,
        },
      ],
      planItemId: planItem.id,
      cuotaNumero: null,
    });
  });
}

/**
 * El calendario de cuotas (§1.9): N cargos con sus fechas EXPLÍCITAS, creados
 * por una persona de Caja en una acción aparte de la aceptación del plan.
 * Atómico: o nacen todas las cuotas o ninguna.
 */
export async function crearCalendarioCuotas(ctx: TenantContext, input: CrearCalendarioCuotasInput) {
  requirePermiso(ctx, "caja:write");
  return conTenant(ctx, async (tx) => {
    if (
      !(await bloquearPlanItemParaCaja(tx, {
        clinicaId: ctx.clinicaId,
        planItemId: input.planItemId,
      }))
    ) {
      throw new Error("El tratamiento del plan no existe.");
    }
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
        precioUnitarioCentavos: true,
        descuentoCentavos: true,
        cargos: { where: { anuladoEn: null }, select: { id: true } },
        procedimientos: {
          where: { estado: "REALIZADO", cargoId: { not: null } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!planItem) {
      throw new Error("El tratamiento no pertenece a un plan aceptado de este paciente.");
    }
    // No se mezclan cobro único y cuotas; el lock evita carreras entre ambos.
    if (planItem.cargos.length > 0) {
      throw new Error("Este tratamiento ya tiene un cobro vigente, único o por cuotas.");
    }
    if (planItem.procedimientos.length > 0) {
      throw new Error("Este tratamiento ya fue cobrado por el flujo anterior de sesiones.");
    }
    const totalAcordado = planItem.precioUnitarioCentavos - planItem.descuentoCentavos;
    const totalCalendario = input.montoCuotaCentavos * input.fechas.length;
    if (totalCalendario !== totalAcordado) {
      throw new Error(
        "La suma de las cuotas debe ser exactamente igual al precio total acordado en el plan.",
      );
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

/** Datos financieros mínimos que Caja necesita para acordar cuotas, sin leer contenido clínico. */
export async function listarTratamientosParaCuotas(
  ctx: TenantContext,
  pacienteId: string,
) {
  requirePermiso(ctx, "caja:read");
  return conTenant(ctx, async (tx) => {
    const items = await tx.planItem.findMany({
      where: {
        clinicaId: ctx.clinicaId,
        estado: { in: ["ACEPTADO", "EN_PROCESO", "COMPLETADO"] },
        plan: { estado: "ACEPTADO", pacienteId },
        cargos: { none: { anuladoEn: null } },
        procedimientos: { none: { cargoId: { not: null } } },
      },
      select: {
        id: true,
        tratamientoNombre: true,
        precioUnitarioCentavos: true,
        descuentoCentavos: true,
      },
      orderBy: { creadoEn: "asc" },
      take: 100,
    });
    return items
      .map((item) => ({
        id: item.id,
        tratamientoNombre: item.tratamientoNombre,
        precioAcordadoCentavos: item.precioUnitarioCentavos - item.descuentoCentavos,
      }))
      .filter((item) => item.precioAcordadoCentavos > 0);
  });
}

/**
 * La lista de trabajo de Caja: un PlanItem aparece una sola vez cuando ya tiene
 * al menos una sesión realizada. Así tres sesiones no se convierten en tres
 * oportunidades de cobro (ADR-017).
 */
export async function listarTratamientosRealizadosSinCargo(
  ctx: TenantContext,
  pacienteId?: string,
) {
  requirePermiso(ctx, "caja:read");
  return conTenant(ctx, async (tx) => {
    const items = await tx.planItem.findMany({
      where: {
        clinicaId: ctx.clinicaId,
        estado: { in: ["ACEPTADO", "EN_PROCESO", "COMPLETADO"] },
        plan: { estado: "ACEPTADO", ...(pacienteId ? { pacienteId } : {}) },
        procedimientos: {
          some: { estado: "REALIZADO" },
          none: { estado: "REALIZADO", cargoId: { not: null } },
        },
        cargos: { none: { anuladoEn: null } },
      },
      select: {
        id: true,
        tratamientoNombre: true,
        precioUnitarioCentavos: true,
        descuentoCentavos: true,
        plan: {
          select: {
            pacienteId: true,
            paciente: { select: { nombres: true, apellidos: true } },
          },
        },
        procedimientos: {
          where: { estado: "REALIZADO" },
          select: { realizadoEn: true },
          orderBy: { realizadoEn: "asc" },
          take: 1,
        },
      },
      take: 200,
    });
    return items
      .map((item) => ({
        id: item.id,
        pacienteId: item.plan.pacienteId,
        pacienteNombre: `${item.plan.paciente.nombres} ${item.plan.paciente.apellidos}`,
        tratamientoNombre: item.tratamientoNombre,
        precioAcordadoCentavos: item.precioUnitarioCentavos - item.descuentoCentavos,
        realizadoEn: item.procedimientos[0].realizadoEn.toISOString(),
      }))
      .filter((item) => item.precioAcordadoCentavos > 0)
      .sort((a, b) => a.realizadoEn.localeCompare(b.realizadoEn));
  });
}
