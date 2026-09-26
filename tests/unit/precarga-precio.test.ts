import { describe, expect, it } from "vitest";

import { esPorDebajoDelHabitual, precioAlElegirTratamiento } from "@/lib/precarga-precio";

describe("precarga del precio al elegir tratamiento (ADR-020)", () => {
  it("precarga el habitual si la persona no escribió nada", () => {
    expect(precioAlElegirTratamiento("", false, 4500)).toBe("45.00");
  });

  it("cambiar a un tratamiento SIN habitual vacía el campo: no hereda el precio anterior", () => {
    // Elegí A ($45, precargado) y después B, que no tiene tarifa. Antes el campo
    // se quedaba en 45.00 y B se guardaba a $45 sin que nadie lo pensara.
    expect(precioAlElegirTratamiento("45.00", false, null)).toBe("");
    expect(precioAlElegirTratamiento("45.00", false, undefined)).toBe("");
  });

  it("lo que la persona escribió a mano nunca se pisa", () => {
    expect(precioAlElegirTratamiento("38.00", true, 4500)).toBe("38.00");
    expect(precioAlElegirTratamiento("38.00", true, null)).toBe("38.00");
  });
});

describe("aviso de tarifa preferencial en pantalla", () => {
  it("solo por debajo del habitual", () => {
    expect(esPorDebajoDelHabitual("40", 4500)).toBe(true);
    expect(esPorDebajoDelHabitual("50.00", 4500)).toBe(false);
  });

  it("'45' y '45.00' son el mismo precio: no hay preferencial", () => {
    expect(esPorDebajoDelHabitual("45", 4500)).toBe(false);
    expect(esPorDebajoDelHabitual("45.00", 4500)).toBe(false);
  });

  it("un texto que no es monto no dispara el aviso", () => {
    expect(esPorDebajoDelHabitual("abc", 4500)).toBe(false);
    expect(esPorDebajoDelHabitual("", 4500)).toBe(false);
  });
});
