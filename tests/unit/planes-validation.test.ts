import { describe, expect, it } from "vitest";

import { AgregarPlanItemSchema } from "@/lib/validation/planes";

const base = {
  planId: "plan-1",
  tratamientoId: "tratamiento-1",
  diagnosticoId: null,
  descuentoCentavos: 0,
  dientes: [],
};

describe("precio acordado de un tratamiento", () => {
  it("acepta un precio elegido específicamente para el paciente", () => {
    const resultado = AgregarPlanItemSchema.parse({
      ...base,
      precioAcordadoCentavos: 15000,
    });

    expect(resultado.precioAcordadoCentavos).toBe(15000);
  });

  it("rechaza descuentos mayores al precio acordado", () => {
    const resultado = AgregarPlanItemSchema.safeParse({
      ...base,
      precioAcordadoCentavos: 10000,
      descuentoCentavos: 10001,
    });

    expect(resultado.success).toBe(false);
  });

  it("exige centavos enteros no negativos", () => {
    expect(
      AgregarPlanItemSchema.safeParse({ ...base, precioAcordadoCentavos: -1 }).success,
    ).toBe(false);
    expect(
      AgregarPlanItemSchema.safeParse({ ...base, precioAcordadoCentavos: 10.5 }).success,
    ).toBe(false);
  });
});
