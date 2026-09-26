import { describe, expect, it } from "vitest";

import {
  ActualizarTratamientoSchema,
  CrearTratamientoSchema,
} from "@/lib/validation/catalogo";

const base = {
  categoriaNombre: "Restaurativa",
  codigo: "res-09",
  nombre: "Restauración con resina",
  alcance: "DIENTE" as const,
  requiereDiente: true,
  permiteMultiplesDientes: false,
  permiteSuperficies: true,
  permiteMultiplesSuperficies: true,
  requiereDiagnostico: false,
  permiteMultiplesSesiones: false,
  precioHabitualCentavos: null,
};

describe("CrearTratamientoSchema", () => {
  it("acepta un tratamiento coherente y normaliza el código a mayúsculas", () => {
    const resultado = CrearTratamientoSchema.parse(base);
    expect(resultado.codigo).toBe("RES-09");
    expect(resultado.categoriaNombre).toBe("Restaurativa");
  });

  it("rechaza una categoría vacía o demasiado larga", () => {
    expect(() => CrearTratamientoSchema.parse({ ...base, categoriaNombre: "  " })).toThrow();
    expect(() => CrearTratamientoSchema.parse({ ...base, categoriaNombre: "x".repeat(81) })).toThrow();
  });

  it("rechaza superficies sin pieza: espejo del CHECK de la base", () => {
    expect(() =>
      CrearTratamientoSchema.parse({ ...base, requiereDiente: false, permiteMultiplesDientes: false }),
    ).toThrow(/superficies/i);
  });

  it("rechaza múltiples superficies sin permitir superficies", () => {
    expect(() =>
      CrearTratamientoSchema.parse({ ...base, permiteSuperficies: false }),
    ).toThrow(/superficies/i);
  });

  it("rechaza un tratamiento de boca completa que exige pieza", () => {
    expect(() =>
      CrearTratamientoSchema.parse({
        ...base,
        alcance: "BOCA",
        permiteSuperficies: false,
        permiteMultiplesSuperficies: false,
      }),
    ).toThrow(/boca completa/i);
  });
});

describe("precio habitual (ADR-020)", () => {
  it("acepta null: un tratamiento puede no tener tarifa todavía", () => {
    expect(CrearTratamientoSchema.parse(base).precioHabitualCentavos).toBeNull();
  });

  it("acepta centavos enteros y conserva el monto tal cual", () => {
    expect(CrearTratamientoSchema.parse({ ...base, precioHabitualCentavos: 4500 }).precioHabitualCentavos)
      .toBe(4500);
    // Cero es un precio habitual válido y NO es lo mismo que "sin tarifa".
    expect(CrearTratamientoSchema.parse({ ...base, precioHabitualCentavos: 0 }).precioHabitualCentavos)
      .toBe(0);
  });

  it("rechaza un monto negativo: espejo del CHECK de la base", () => {
    expect(() => CrearTratamientoSchema.parse({ ...base, precioHabitualCentavos: -1 }))
      .toThrow(/negativo/i);
  });

  it("rechaza decimales: el dinero llega en centavos enteros (ADR-009)", () => {
    expect(() => CrearTratamientoSchema.parse({ ...base, precioHabitualCentavos: 45.5 }))
      .toThrow(/centavos enteros/i);
  });

  it("rechaza NaN, que es como llega un texto que no era un monto", () => {
    // La Server Action manda NaN en vez de null cuando alguien escribe "abc":
    // devolver null ahí borraría el precio de la clínica en silencio.
    expect(() => CrearTratamientoSchema.parse({ ...base, precioHabitualCentavos: Number.NaN }))
      .toThrow(/no es un monto válido/i);
  });

  it("rechaza un texto en dólares: la conversión es de centavosDesdeTexto, no del esquema", () => {
    // `Number("45.00")` da 45, y 45 centavos no es $45.00. El esquema no acepta
    // strings justamente para que ese error no tenga dónde ocurrir.
    expect(() => CrearTratamientoSchema.parse({ ...base, precioHabitualCentavos: "45.00" }))
      .toThrow(/no es un monto válido/i);
  });
});

describe("ActualizarTratamientoSchema", () => {
  it("solo permite nombre, activo y precio habitual", () => {
    const resultado = ActualizarTratamientoSchema.parse({
      nombre: "Resina compuesta",
      activo: false,
      precioHabitualCentavos: 5000,
      // Un cliente malicioso que intente colar banderas o clinicaId no los verá salir.
      requiereDiente: false,
      clinicaId: "otra",
    });
    expect(resultado).toEqual({
      nombre: "Resina compuesta",
      activo: false,
      precioHabitualCentavos: 5000,
    });
  });

  it("vaciar el campo deja el tratamiento sin tarifa, sin romper nada", () => {
    expect(
      ActualizarTratamientoSchema.parse({
        nombre: "Resina compuesta",
        activo: true,
        precioHabitualCentavos: null,
      }).precioHabitualCentavos,
    ).toBeNull();
  });
});
