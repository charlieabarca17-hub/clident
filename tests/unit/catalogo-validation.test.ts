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

describe("ActualizarTratamientoSchema", () => {
  it("solo permite nombre y activo", () => {
    const resultado = ActualizarTratamientoSchema.parse({
      nombre: "Resina compuesta",
      activo: false,
      // Un cliente malicioso que intente colar precio, banderas o clinicaId no los verá salir.
      precioListaCentavos: 5000,
      requiereDiente: false,
      clinicaId: "otra",
    });
    expect(resultado).toEqual({
      nombre: "Resina compuesta",
      activo: false,
    });
  });
});
