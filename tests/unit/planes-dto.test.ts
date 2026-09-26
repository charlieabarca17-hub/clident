import { describe, expect, it } from "vitest";

import { toPlanItemDto } from "@/server/dto/planes";

/**
 * La tarifa preferencial del ADR-020 no es una columna: es la diferencia entre
 * el precio acordado y **el que era habitual cuando se armó el plan**. Estas
 * pruebas fijan esa aritmética, incluidos los casos donde `0` y `null`
 * significan cosas distintas.
 */
function item(precioUnitarioCentavos: number, precioHabitualCentavos: number | null) {
  return toPlanItemDto({
    id: "item-1",
    tratamientoCodigo: "RES-01",
    tratamientoNombre: "Restauración con resina",
    precioUnitarioCentavos,
    precioHabitualCentavos,
    descuentoCentavos: 0,
    estado: "PROPUESTO",
    diagnosticoId: null,
    creadoEn: new Date("2026-09-22T12:00:00.000Z"),
    dientes: [],
  });
}

describe("tarifa preferencial del PlanItem (ADR-020)", () => {
  it("cobrar por debajo de lo habitual registra la diferencia", () => {
    const dto = item(4000, 5000);
    expect(dto.precioHabitualCentavos).toBe(5000);
    expect(dto.preferencialCentavos).toBe(1000);
  });

  it("cobrar exactamente lo habitual no es un preferencial: es cero", () => {
    expect(item(5000, 5000).preferencialCentavos).toBe(0);
  });

  it("cobrar por encima de lo habitual no produce un preferencial negativo", () => {
    // Un preferencial negativo sería un recargo, y este sistema no registra
    // recargos: la diferencia hacia arriba se ve comparando los dos montos.
    expect(item(6000, 5000).preferencialCentavos).toBe(0);
  });

  it("sin precio habitual el preferencial es null, no cero", () => {
    // `null` = "no hay contra qué comparar". `0` = "se cobró lo habitual".
    // Confundirlos haría que un tratamiento sin tarifa parezca cobrado a precio
    // de lista en cualquier reporte futuro.
    const dto = item(4000, null);
    expect(dto.precioHabitualCentavos).toBeNull();
    expect(dto.preferencialCentavos).toBeNull();
  });

  it("el preferencial se mide contra el precio acordado, no contra el final", () => {
    // El descuento es otra cosa (ADR-020): es una rebaja sobre lo acordado,
    // dentro del mismo plan. Un plan puede tener las dos y no se suman.
    const dto = toPlanItemDto({
      id: "item-2",
      tratamientoCodigo: "RES-01",
      tratamientoNombre: "Restauración con resina",
      precioUnitarioCentavos: 4000,
      precioHabitualCentavos: 5000,
      descuentoCentavos: 500,
      estado: "PROPUESTO",
      diagnosticoId: null,
      creadoEn: new Date("2026-09-22T12:00:00.000Z"),
      dientes: [],
    });
    expect(dto.preferencialCentavos).toBe(1000);
    expect(dto.precioFinalCentavos).toBe(3500);
  });

  it("dos ítems con el mismo precio acordado difieren si el habitual difería", () => {
    // Esta es la razón de ser del snapshot: el mismo $40 es un preferencial de
    // $10 en enero y de $50 en marzo si la clínica subió su tarifa en medio.
    expect(item(4000, 5000).preferencialCentavos).toBe(1000);
    expect(item(4000, 9000).preferencialCentavos).toBe(5000);
  });
});
