import type { EstadoPlan, EstadoPlanItem } from "@/lib/estados-plan";

type DienteDb = { fdi: number; superficie: string };

type PlanItemDb = {
  id: string;
  tratamientoCodigo: string;
  tratamientoNombre: string;
  precioUnitarioCentavos: number;
  precioHabitualCentavos: number | null;
  descuentoCentavos: number;
  estado: EstadoPlanItem;
  diagnosticoId: string | null;
  creadoEn: Date;
  dientes: DienteDb[];
};

type PlanDb = {
  id: string;
  titulo: string | null;
  estado: EstadoPlan;
  presentadoEn: Date | null;
  aceptadoEn: Date | null;
  rechazadoEn: Date | null;
  anuladoEn: Date | null;
  motivoAnulacion: string | null;
  creadoEn: Date;
  creadoPor: { usuario: { nombre: string } };
  items: PlanItemDb[];
};

export function toPlanItemDto(item: PlanItemDb) {
  return {
    id: item.id,
    tratamientoCodigo: item.tratamientoCodigo,
    tratamientoNombre: item.tratamientoNombre,
    precioUnitarioCentavos: item.precioUnitarioCentavos,
    precioHabitualCentavos: item.precioHabitualCentavos,
    descuentoCentavos: item.descuentoCentavos,
    // Derivado para mostrar; el dato canónico son los dos campos de arriba.
    precioFinalCentavos: item.precioUnitarioCentavos - item.descuentoCentavos,
    // Tarifa preferencial (ADR-020): cuánto se cobró por debajo de lo habitual
    // DE ESE MOMENTO. No es un campo guardado —sería un tercer número que puede
    // desalinearse—: es la diferencia contra el snapshot. `null` cuando el
    // tratamiento no tenía precio habitual, que no es lo mismo que cero.
    preferencialCentavos:
      item.precioHabitualCentavos === null
        ? null
        : Math.max(0, item.precioHabitualCentavos - item.precioUnitarioCentavos),
    estado: item.estado,
    diagnosticoId: item.diagnosticoId,
    creadoEn: item.creadoEn.toISOString(),
    dientes: item.dientes.map((d) => ({ fdi: d.fdi, superficie: d.superficie })),
  };
}

export type PlanItemDto = ReturnType<typeof toPlanItemDto>;

export function toPlanDto(plan: PlanDb) {
  return {
    id: plan.id,
    titulo: plan.titulo,
    estado: plan.estado,
    presentadoEn: plan.presentadoEn?.toISOString() ?? null,
    aceptadoEn: plan.aceptadoEn?.toISOString() ?? null,
    rechazadoEn: plan.rechazadoEn?.toISOString() ?? null,
    anuladoEn: plan.anuladoEn?.toISOString() ?? null,
    motivoAnulacion: plan.motivoAnulacion,
    creadoEn: plan.creadoEn.toISOString(),
    creadoPorNombre: plan.creadoPor.usuario.nombre,
    items: plan.items.map(toPlanItemDto),
  };
}

export type PlanDto = ReturnType<typeof toPlanDto>;
