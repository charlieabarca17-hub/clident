import { describe, expect, it } from "vitest";

import {
  itemRequierePlanAceptado,
  puedeTransicionarItem,
  puedeTransicionarPlan,
} from "@/lib/estados-plan";

// La suite `estados-plan` que REGLAS §4.5 exige: la base no puede vigilar
// transiciones (un CHECK no ve el valor anterior), así que esta tabla probada
// es el mecanismo real. Pendiente #17.

describe("transiciones de PlanTratamiento", () => {
  it("el flujo feliz completo es válido", () => {
    expect(puedeTransicionarPlan("BORRADOR", "PRESENTADO")).toBe(true);
    expect(puedeTransicionarPlan("PRESENTADO", "ACEPTADO")).toBe(true);
    expect(puedeTransicionarPlan("PRESENTADO", "RECHAZADO")).toBe(true);
  });

  it("ACEPTADO → PRESENTADO está prohibida: no se reescribe la prueba de la oferta", () => {
    expect(puedeTransicionarPlan("ACEPTADO", "PRESENTADO")).toBe(false);
    expect(puedeTransicionarPlan("ACEPTADO", "BORRADOR")).toBe(false);
    expect(puedeTransicionarPlan("ACEPTADO", "RECHAZADO")).toBe(false);
  });

  it("todo estado no terminal puede anularse con motivo; ANULADO es terminal", () => {
    for (const desde of ["BORRADOR", "PRESENTADO", "ACEPTADO", "RECHAZADO"] as const) {
      expect(puedeTransicionarPlan(desde, "ANULADO"), desde).toBe(true);
    }
    for (const hacia of ["BORRADOR", "PRESENTADO", "ACEPTADO", "RECHAZADO"] as const) {
      expect(puedeTransicionarPlan("ANULADO", hacia), hacia).toBe(false);
    }
  });

  it("no hay saltos: BORRADOR no acepta ni rechaza directo", () => {
    expect(puedeTransicionarPlan("BORRADOR", "ACEPTADO")).toBe(false);
    expect(puedeTransicionarPlan("BORRADOR", "RECHAZADO")).toBe(false);
  });
});

describe("transiciones de PlanItem", () => {
  it("el flujo clínico es válido, incluida la sesión única", () => {
    expect(puedeTransicionarItem("PROPUESTO", "ACEPTADO")).toBe(true);
    expect(puedeTransicionarItem("ACEPTADO", "EN_PROCESO")).toBe(true);
    expect(puedeTransicionarItem("ACEPTADO", "COMPLETADO")).toBe(true);
    expect(puedeTransicionarItem("EN_PROCESO", "EN_PROCESO")).toBe(true);
    expect(puedeTransicionarItem("EN_PROCESO", "COMPLETADO")).toBe(true);
  });

  it("COMPLETADO → CANCELADO está prohibida; COMPLETADO → ANULADO existe", () => {
    expect(puedeTransicionarItem("COMPLETADO", "CANCELADO")).toBe(false);
    expect(puedeTransicionarItem("COMPLETADO", "ANULADO")).toBe(true);
  });

  it("cancelar solo aplica a lo no terminado; CANCELADO y ANULADO son terminales", () => {
    for (const desde of ["PROPUESTO", "ACEPTADO", "EN_PROCESO"] as const) {
      expect(puedeTransicionarItem(desde, "CANCELADO"), desde).toBe(true);
    }
    expect(puedeTransicionarItem("CANCELADO", "PROPUESTO")).toBe(false);
    expect(puedeTransicionarItem("ANULADO", "COMPLETADO")).toBe(false);
    // Un ítem no completado no se "anula": se cancela.
    expect(puedeTransicionarItem("PROPUESTO", "ANULADO")).toBe(false);
  });

  it("el progreso clínico exige plan aceptado; la cancelación no", () => {
    expect(itemRequierePlanAceptado("ACEPTADO")).toBe(true);
    expect(itemRequierePlanAceptado("EN_PROCESO")).toBe(true);
    expect(itemRequierePlanAceptado("COMPLETADO")).toBe(true);
    expect(itemRequierePlanAceptado("CANCELADO")).toBe(false);
    expect(itemRequierePlanAceptado("ANULADO")).toBe(false);
  });
});
