import { describe, expect, it } from "vitest";

import {
  ActualizarTratamientoSchema,
  CrearTratamientoSchema,
} from "@/lib/validation/catalogo";

const base = {
  categoriaId: "cat_1",
  codigo: "res-09",
  nombre: "Restauración con resina",
  precioListaCentavos: 4500,
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
    expect(resultado.precioListaCentavos).toBe(4500);
  });

  it("rechaza el precio que no llegó como centavos enteros", () => {
    expect(() => CrearTratamientoSchema.parse({ ...base, precioListaCentavos: 45.5 })).toThrow();
    expect(() => CrearTratamientoSchema.parse({ ...base, precioListaCentavos: -1 })).toThrow();
    expect(() => CrearTratamientoSchema.parse({ ...base, precioListaCentavos: null })).toThrow();
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
  it("solo permite nombre, precio y activo", () => {
    const resultado = ActualizarTratamientoSchema.parse({
      nombre: "Resina compuesta",
      precioListaCentavos: 5000,
      activo: false,
      // Un cliente malicioso que intente colar banderas o clinicaId no las verá salir.
      requiereDiente: false,
      clinicaId: "otra",
    });
    expect(resultado).toEqual({
      nombre: "Resina compuesta",
      precioListaCentavos: 5000,
      activo: false,
    });
  });
});
