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

describe("la tarifa habitual no viaja en el request (ADR-020)", () => {
  it("el esquema no tiene dónde recibirla: el servidor la lee del catálogo", () => {
    // Si el habitual llegara desde el navegador, un cliente podría declarar que
    // lo normal eran $9,999 e inflar cuánto "se dio" en tarifa preferencial.
    // Zod descarta las claves que no están en el esquema, así que ese campo
    // nunca llega al repositorio (§2.3: los esquemas de entrada no contienen lo
    // que el servidor debe decidir).
    const resultado = AgregarPlanItemSchema.parse({
      ...base,
      precioAcordadoCentavos: 4000,
      precioHabitualCentavos: 999_900,
    });

    expect(resultado).not.toHaveProperty("precioHabitualCentavos");
  });
});
