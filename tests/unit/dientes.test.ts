import { describe, expect, it } from "vitest";

import { buscarDiente, DIENTES } from "@/lib/dientes";

describe("referencia dental FDI", () => {
  it("contiene 32 dientes permanentes y 20 temporales sin duplicados", () => {
    expect(DIENTES).toHaveLength(52);
    expect(new Set(DIENTES.map(({ fdi }) => fdi)).size).toBe(52);
    expect(DIENTES.filter(({ denticion }) => denticion === "PERMANENTE")).toHaveLength(32);
    expect(DIENTES.filter(({ denticion }) => denticion === "TEMPORAL")).toHaveLength(20);
  });

  it("solo asigna oclusal a posteriores e incisal a anteriores", () => {
    expect(buscarDiente(11)?.superficies).toContain("INCISAL");
    expect(buscarDiente(11)?.superficies).not.toContain("OCLUSAL");
    expect(buscarDiente(26)?.superficies).toContain("OCLUSAL");
    expect(buscarDiente(26)?.superficies).not.toContain("INCISAL");
  });

  it("usa palatina arriba y lingual abajo", () => {
    expect(buscarDiente(16)?.superficies).toContain("PALATINA");
    expect(buscarDiente(36)?.superficies).toContain("LINGUAL");
  });
});
