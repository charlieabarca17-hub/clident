import { describe, expect, it } from "vitest";

import {
  CrearMaterialSchema,
  MovimientoInventarioSchema,
  deltaDeMovimiento,
} from "@/lib/validation/inventario";

describe("CrearMaterialSchema", () => {
  const base = { nombre: "Resina A2", unidad: "jeringa", stockActual: 10, stockMinimo: 3 };

  it("acepta un material con costo opcional", () => {
    const resultado = CrearMaterialSchema.parse(base);
    expect(resultado.costoUnitarioCentavos).toBeNull();
  });

  it("rechaza stock negativo y no enteros", () => {
    expect(() => CrearMaterialSchema.parse({ ...base, stockActual: -1 })).toThrow();
    expect(() => CrearMaterialSchema.parse({ ...base, stockMinimo: -1 })).toThrow();
    expect(() => CrearMaterialSchema.parse({ ...base, stockActual: 1.5 })).toThrow();
  });
});

describe("MovimientoInventarioSchema", () => {
  const base = { materialId: "mat_1", tipo: "ENTRADA" as const, cantidad: 5, ajusteNegativo: false, motivo: "" };

  it("un ajuste sin motivo se rechaza: un conteo físico se explica", () => {
    expect(() => MovimientoInventarioSchema.parse({ ...base, tipo: "AJUSTE" })).toThrow(/motivo/i);
    const conMotivo = MovimientoInventarioSchema.parse({
      ...base,
      tipo: "AJUSTE",
      motivo: "Conteo físico del 18 de julio.",
    });
    expect(conMotivo.motivo).toContain("Conteo");
  });

  it("entradas y salidas no exigen motivo", () => {
    expect(MovimientoInventarioSchema.parse(base).motivo).toBeNull();
    expect(MovimientoInventarioSchema.parse({ ...base, tipo: "SALIDA" }).motivo).toBeNull();
  });

  it("rechaza cantidades cero o negativas: el signo lo pone el tipo", () => {
    expect(() => MovimientoInventarioSchema.parse({ ...base, cantidad: 0 })).toThrow();
    expect(() => MovimientoInventarioSchema.parse({ ...base, cantidad: -5 })).toThrow();
  });
});

describe("deltaDeMovimiento", () => {
  it("ENTRADA suma, SALIDA resta, y el ajuste según su bandera", () => {
    const base = { materialId: "m", cantidad: 7, motivo: null as string | null };
    expect(deltaDeMovimiento({ ...base, tipo: "ENTRADA", ajusteNegativo: false })).toBe(7);
    expect(deltaDeMovimiento({ ...base, tipo: "SALIDA", ajusteNegativo: false })).toBe(-7);
    expect(deltaDeMovimiento({ ...base, tipo: "AJUSTE", ajusteNegativo: false, motivo: "x" })).toBe(7);
    expect(deltaDeMovimiento({ ...base, tipo: "AJUSTE", ajusteNegativo: true, motivo: "x" })).toBe(-7);
  });
});
