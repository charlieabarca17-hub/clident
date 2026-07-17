import { describe, expect, it } from "vitest";

import { esExclusionDeCita } from "@/lib/errors";

describe("mapeo de errores de Agenda", () => {
  it("reconoce 23P01 y el constraint directo de PostgreSQL", () => {
    expect(esExclusionDeCita(
      { code: "23P01", constraint: "citas_sin_traslape" },
      "citas_sin_traslape",
    )).toBe(true);
  });

  it("reconoce la variante del adaptador Prisma con meta anidada", () => {
    expect(esExclusionDeCita(
      { meta: { code: "23P01", constraint: "citas_paciente_sin_traslape" } },
      "citas_paciente_sin_traslape",
    )).toBe(true);
  });

  it("no confunde otros errores o constraints", () => {
    expect(esExclusionDeCita(
      { code: "23514", constraint: "citas_rango_valido" },
      "citas_sin_traslape",
    )).toBe(false);
  });
});
