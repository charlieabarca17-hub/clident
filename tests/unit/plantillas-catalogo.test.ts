import { describe, expect, it } from "vitest";

import { PLANTILLAS_CATEGORIA } from "../../prisma/seed/categorias.ts";
import { PLANTILLAS_TRATAMIENTO } from "../../prisma/seed/tratamientos.ts";

// La semilla es dato, no código: estas pruebas la validan ANTES de que llegue a la
// base, donde los CHECK la rechazarían con errores mucho menos legibles.

describe("plantillas de categorías", () => {
  it("son exactamente 12, con ids y órdenes únicos", () => {
    expect(PLANTILLAS_CATEGORIA).toHaveLength(12);
    expect(new Set(PLANTILLAS_CATEGORIA.map((c) => c.id)).size).toBe(12);
    expect(new Set(PLANTILLAS_CATEGORIA.map((c) => c.orden)).size).toBe(12);
  });
});

describe("plantillas de tratamientos", () => {
  it("hay un catálogo inicial sustancial (~100) con códigos únicos", () => {
    expect(PLANTILLAS_TRATAMIENTO.length).toBeGreaterThanOrEqual(90);
    expect(new Set(PLANTILLAS_TRATAMIENTO.map((t) => t.codigo)).size).toBe(
      PLANTILLAS_TRATAMIENTO.length,
    );
  });

  it("toda plantilla apunta a una categoría existente", () => {
    const categorias = new Set(PLANTILLAS_CATEGORIA.map((c) => c.id));
    for (const tratamiento of PLANTILLAS_TRATAMIENTO) {
      expect(categorias.has(tratamiento.categoriaId), tratamiento.codigo).toBe(true);
    }
  });

  it("la referencia no impone precios a las clínicas", () => {
    for (const tratamiento of PLANTILLAS_TRATAMIENTO) {
      expect("precioSugeridoCentavos" in tratamiento, tratamiento.codigo).toBe(false);
    }
  });

  it("las banderas son coherentes: espejo del CHECK de la base", () => {
    for (const t of PLANTILLAS_TRATAMIENTO) {
      const etiqueta = t.codigo;
      if (t.permiteMultiplesSuperficies) expect(t.permiteSuperficies, etiqueta).toBe(true);
      if (t.permiteSuperficies) expect(t.requiereDiente, etiqueta).toBe(true);
      if (t.permiteMultiplesDientes) expect(t.requiereDiente, etiqueta).toBe(true);
      if (t.alcance === "BOCA") expect(t.requiereDiente, etiqueta).toBe(false);
    }
  });

  it("ninguna plantilla codifica una superficie en el nombre (REGLAS §4.7)", () => {
    const sospechosos = /(oclusal|mesial|distal|vestibular|palatin|lingual|incisal)/i;
    for (const tratamiento of PLANTILLAS_TRATAMIENTO) {
      // "Reconstrucción de ángulo incisal" describe la anatomía a reconstruir, no
      // una variante por superficie; el resto del catálogo no debe nombrar caras.
      if (tratamiento.codigo === "RES-04") continue;
      expect(sospechosos.test(tratamiento.nombre), tratamiento.nombre).toBe(false);
    }
  });
});
