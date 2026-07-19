import { describe, expect, it } from "vitest";

import { puedeEditarNotaDirecto, VENTANA_EDICION_NOTA_MS } from "@/lib/procedimientos";
import { RealizarProcedimientoSchema } from "@/lib/validation/procedimientos";

describe("ventana de edición de nota (12 h, solo el autor)", () => {
  const creadoEn = new Date("2026-07-18T08:00:00Z");

  it("el autor puede editar dentro de la ventana", () => {
    expect(
      puedeEditarNotaDirecto({
        creadoEn,
        autorId: "m1",
        membresiaActualId: "m1",
        ahora: new Date(creadoEn.getTime() + VENTANA_EDICION_NOTA_MS - 1),
      }),
    ).toBe(true);
  });

  it("pasadas las 12 horas, ni el autor puede", () => {
    expect(
      puedeEditarNotaDirecto({
        creadoEn,
        autorId: "m1",
        membresiaActualId: "m1",
        ahora: new Date(creadoEn.getTime() + VENTANA_EDICION_NOTA_MS + 1),
      }),
    ).toBe(false);
  });

  it("otra persona no puede, ni dentro de la ventana", () => {
    expect(
      puedeEditarNotaDirecto({
        creadoEn,
        autorId: "m1",
        membresiaActualId: "m2",
        ahora: new Date(creadoEn.getTime() + 1000),
      }),
    ).toBe(false);
  });
});

describe("RealizarProcedimientoSchema", () => {
  const base = {
    pacienteId: "pac_1",
    planItemId: "item_1",
    realizadoEn: "",
    notasClinicas: "",
    condicionResultante: "OBTURACION",
    dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
  };

  it("acepta el caso típico y usa ahora como fecha", () => {
    const resultado = RealizarProcedimientoSchema.parse(base);
    expect(Math.abs(resultado.realizadoEn.getTime() - Date.now())).toBeLessThan(5_000);
    expect(resultado.notasClinicas).toBeNull();
  });

  it("piezas sin condición resultante: rechazado (el odontograma quedaría sin pintar)", () => {
    expect(() =>
      RealizarProcedimientoSchema.parse({ ...base, condicionResultante: null }),
    ).toThrow(/condición/i);
  });

  it("rechaza fechas futuras y caras imposibles", () => {
    expect(() =>
      RealizarProcedimientoSchema.parse({ ...base, realizadoEn: "2030-01-01T10:00" }),
    ).toThrow(/futuro/i);
    expect(() =>
      RealizarProcedimientoSchema.parse({ ...base, dientes: [{ fdi: 11, superficie: "OCLUSAL" }] }),
    ).toThrow(/no tiene la cara/i);
  });
});
