import { describe, expect, it } from "vitest";

import { RegistrarCondicionSchema } from "@/lib/validation/odontograma";

const base = {
  pacienteId: "pac_1",
  fdi: 26,
  superficie: "OCLUSAL",
  condicion: "CARIES",
  ocurridoEn: "",
  diagnosticoId: "",
};

describe("RegistrarCondicionSchema", () => {
  it("con fecha vacía usa ahora; con fecha pasada la respeta", () => {
    const ahora = RegistrarCondicionSchema.parse(base);
    expect(Math.abs(ahora.ocurridoEn.getTime() - Date.now())).toBeLessThan(5_000);
    expect(ahora.diagnosticoId).toBeNull();

    const retro = RegistrarCondicionSchema.parse({ ...base, ocurridoEn: "2026-06-01T09:30" });
    expect(retro.ocurridoEn.getFullYear()).toBe(2026);
    expect(retro.ocurridoEn.getMonth()).toBe(5);
  });

  it("rechaza un hallazgo en el futuro", () => {
    expect(() =>
      RegistrarCondicionSchema.parse({ ...base, ocurridoEn: "2030-01-01T10:00" }),
    ).toThrow(/futuro/i);
  });

  it("rechaza piezas o caras imposibles", () => {
    expect(() => RegistrarCondicionSchema.parse({ ...base, fdi: 99 })).toThrow(/no existe/i);
    // El incisivo 11 no tiene cara oclusal.
    expect(() => RegistrarCondicionSchema.parse({ ...base, fdi: 11 })).toThrow(/no tiene la cara/i);
  });

  it("rechaza una condición fuera del catálogo", () => {
    expect(() => RegistrarCondicionSchema.parse({ ...base, condicion: "GINGIVITIS" })).toThrow();
  });
});
