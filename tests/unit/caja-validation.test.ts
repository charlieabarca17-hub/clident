import { describe, expect, it } from "vitest";

import {
  CrearCalendarioCuotasSchema,
  CrearCargoDePlanSchema,
  CrearCargoSchema,
} from "@/lib/validation/caja";

/**
 * La fecha exigible decide en qué saldo cae un cargo (ADR-013). Una fecha que no
 * existe no puede terminar guardada como OTRO día: `new Date("2026-02-30")` es el
 * 2 de marzo, y el `CHECK` de rango de la base no lo nota porque el 2 de marzo sí
 * es razonable.
 */
const LINEA = { procedimientoId: null, descripcion: "Consulta", precioOriginalCentavos: 2000, descuentoCentavos: 0 };

describe("fechas de Caja", () => {
  it("rechaza fechas que no existen en el calendario", () => {
    for (const imposible of ["2026-02-30", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10"]) {
      expect(CrearCargoDePlanSchema.safeParse({
        pacienteId: "p1",
        planItemId: "i1",
        fechaExigibleEn: imposible,
      }).success).toBe(false);
      expect(CrearCargoSchema.safeParse({
        pacienteId: "p1",
        descripcion: "Consulta",
        fechaExigibleEn: imposible,
        lineas: [LINEA],
      }).success).toBe(false);
      expect(CrearCalendarioCuotasSchema.safeParse({
        pacienteId: "p1",
        planItemId: "i1",
        montoCuotaCentavos: 6000,
        fechas: ["2026-01-15", imposible],
      }).success).toBe(false);
    }
  });

  it("acepta fechas reales, incluido el 29 de febrero de un bisiesto", () => {
    for (const real of ["2026-02-28", "2028-02-29", "2026-12-31"]) {
      expect(CrearCargoDePlanSchema.safeParse({
        pacienteId: "p1",
        planItemId: "i1",
        fechaExigibleEn: real,
      }).success).toBe(true);
    }
  });
});
