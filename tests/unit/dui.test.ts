import { describe, expect, it } from "vitest";
import { FORMATO_DUI, esFormatoDui } from "@/lib/dui";

// El dígito verificador NO se valida: está pendiente de evidencia oficial del RNPN.
// Ver la nota de src/lib/dui.ts. No hay pruebas de eso porque no hay eso.

describe("esFormatoDui", () => {
  it("acepta la forma ########-#", () => {
    expect(esFormatoDui("12345678-4")).toBe(true);
    expect(esFormatoDui("00000000-0")).toBe(true);
    expect(esFormatoDui("98765432-1")).toBe(true);
  });

  it("rechaza formas que el CHECK de la base también rechaza", () => {
    expect(esFormatoDui("123456784")).toBe(false); //     sin guion
    expect(esFormatoDui("1234567-8")).toBe(false); //     7 dígitos
    expect(esFormatoDui("123456789-0")).toBe(false); //   9 dígitos
    expect(esFormatoDui("12345678-45")).toBe(false); //   2 verificadores
    expect(esFormatoDui("12345678-")).toBe(false); //     sin verificador
    expect(esFormatoDui("1234567a-4")).toBe(false); //    letra
    expect(esFormatoDui("12345678–4")).toBe(false); //    guion largo (–), no guion (-)
    expect(esFormatoDui(" 12345678-4")).toBe(false); //   espacio al inicio
    expect(esFormatoDui("12345678-4 ")).toBe(false); //   espacio al final
    expect(esFormatoDui("")).toBe(false);
  });

  // El regex lleva anclas ^ y $. Sin ellas, "el DUI es 12345678-4, gracias" pasaría, y
  // ese string llegaría a una columna cuyo CHECK sí ancla → la app diría que está bien y
  // la base lo rechazaría. Los dos lados tienen que decir lo mismo.
  it("no acepta un DUI incrustado en otro texto", () => {
    expect(esFormatoDui("el DUI es 12345678-4")).toBe(false);
    expect(esFormatoDui("12345678-4 y algo más")).toBe(false);
    expect(esFormatoDui("012345678-4")).toBe(false);
  });

  // FORMATO_DUI se exporta para que los esquemas Zod lo reusen en vez de reescribirlo.
  // Un regex copiado a mano en otro archivo es un regex que se va a desincronizar del
  // CHECK de la base.
  it("expone el mismo regex que usa esFormatoDui, sin estado", () => {
    expect(FORMATO_DUI.source).toBe("^\\d{8}-\\d$");
    expect(FORMATO_DUI.global).toBe(false); // con /g, .test() alterna por lastIndex
    expect(FORMATO_DUI.test("12345678-4")).toBe(true);
    expect(FORMATO_DUI.test("12345678-4")).toBe(true);
  });
});
