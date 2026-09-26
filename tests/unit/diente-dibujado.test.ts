import { describe, expect, it } from "vitest";

import { zonasDeLaPieza } from "@/components/odontograma/diente-svg";
import { buscarDiente, seleccionDeCara } from "@/lib/dientes";

// Ciclo 30. El odontograma dibuja cada pieza con sus cinco caras en posición
// anatómica. Un espejo acá no se ve: el dibujo queda igual de lindo y la caries
// aparece del lado equivocado de la boca. Por eso la asignación de caras vive en
// una función pura y se prueba pieza por pieza, en los cuatro cuadrantes.
//
// Las reglas, en una línea: mesial apunta a la línea media; vestibular mira
// hacia afuera (arriba en el maxilar, abajo en la mandíbula); la cara interna va
// enfrente; y la cara cortante al centro.

const zonas = (fdi: number, arriba: boolean) => zonasDeLaPieza(buscarDiente(fdi)!, arriba);

describe("mesial apunta siempre a la línea media", () => {
  // Los cuadrantes 1 y 4 son la DERECHA del paciente y se dibujan a la
  // izquierda del arco: su mesial cae a la derecha del dibujo.
  it.each([16, 11, 46, 41])("la pieza %i lleva mesial a la derecha", (fdi) => {
    const z = zonas(fdi, fdi < 30);
    expect(z.derecha).toBe("MESIAL");
    expect(z.izquierda).toBe("DISTAL");
  });

  // Los cuadrantes 2 y 3 son la IZQUIERDA del paciente, a la derecha del arco.
  it.each([26, 21, 36, 31])("la pieza %i lleva mesial a la izquierda", (fdi) => {
    const z = zonas(fdi, fdi < 30);
    expect(z.izquierda).toBe("MESIAL");
    expect(z.derecha).toBe("DISTAL");
  });
});

describe("vestibular mira hacia afuera de la boca", () => {
  it("en el maxilar va arriba y la palatina abajo", () => {
    const z = zonas(16, true);
    expect(z.arriba).toBe("VESTIBULAR");
    expect(z.abajo).toBe("PALATINA");
  });

  it("en la mandíbula va abajo y la lingual arriba", () => {
    const z = zonas(46, false);
    expect(z.abajo).toBe("VESTIBULAR");
    expect(z.arriba).toBe("LINGUAL");
  });

  it("nunca coloca palatina en una pieza inferior ni lingual en una superior", () => {
    for (const fdi of [11, 16, 21, 26]) {
      expect(zonas(fdi, true).abajo).toBe("PALATINA");
    }
    for (const fdi of [31, 36, 41, 46]) {
      expect(zonas(fdi, false).arriba).toBe("LINGUAL");
    }
  });
});

describe("la cara cortante va al centro y depende del tipo de pieza", () => {
  it.each([11, 12, 13, 21, 31, 41, 43])("la pieza anterior %i lleva incisal", (fdi) => {
    expect(zonas(fdi, fdi < 30).centro).toBe("INCISAL");
  });

  it.each([14, 16, 24, 26, 34, 36, 47])("la pieza posterior %i lleva oclusal", (fdi) => {
    expect(zonas(fdi, fdi < 30).centro).toBe("OCLUSAL");
  });
});

describe("las cinco zonas son siempre distintas y existen en esa pieza", () => {
  it("ninguna cara se dibuja dos veces ni se inventa", () => {
    for (const fdi of [11, 13, 16, 18, 21, 26, 31, 36, 41, 45, 48]) {
      const diente = buscarDiente(fdi)!;
      const z = zonasDeLaPieza(diente, fdi < 30);
      const asignadas = [z.arriba, z.abajo, z.izquierda, z.derecha, z.centro];
      expect(new Set(asignadas).size, `la pieza ${fdi} repite una cara`).toBe(5);
      for (const cara of asignadas) {
        expect(diente.superficies, `la pieza ${fdi} no tiene ${cara}`).toContain(cara);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// La cara sobre la que se trabaja viaja en la URL, así que es entrada de usuario.
// ---------------------------------------------------------------------------
describe("la selección que llega por la URL se valida antes de usarse", () => {
  it("acepta una pieza real con una cara que esa pieza tiene", () => {
    expect(seleccionDeCara("16", "OCLUSAL")).toEqual({ fdi: 16, superficie: "OCLUSAL" });
    expect(seleccionDeCara("11", "INCISAL")).toEqual({ fdi: 11, superficie: "INCISAL" });
    expect(seleccionDeCara("16", "PALATINA")).toEqual({ fdi: 16, superficie: "PALATINA" });
    expect(seleccionDeCara("46", "LINGUAL")).toEqual({ fdi: 46, superficie: "LINGUAL" });
  });

  it("rechaza una cara que esa pieza no tiene", () => {
    // Un incisivo no tiene oclusal: tiene incisal.
    expect(seleccionDeCara("11", "OCLUSAL")).toBeNull();
    // Un molar no tiene incisal.
    expect(seleccionDeCara("16", "INCISAL")).toBeNull();
    // Palatina es de arriba; lingual, de abajo. No se cruzan.
    expect(seleccionDeCara("16", "LINGUAL")).toBeNull();
    expect(seleccionDeCara("46", "PALATINA")).toBeNull();
  });

  it("rechaza piezas inexistentes y basura, sin lanzar", () => {
    for (const [fdi, cara] of [
      ["99", "OCLUSAL"],
      ["19", "OCLUSAL"],
      ["0", "OCLUSAL"],
      ["", "OCLUSAL"],
      [" 16 ", "OCLUSAL"],
      ["16", "oclusal"],
      ["16", "DROP TABLE"],
      ["16", ""],
    ] as const) {
      expect(seleccionDeCara(fdi, cara), `${fdi}/${cara} no debería pasar`).toBeNull();
    }
    expect(seleccionDeCara(undefined, undefined)).toBeNull();
    expect(seleccionDeCara(["16"], "OCLUSAL")).toBeNull();
    expect(seleccionDeCara(16, "OCLUSAL")).toBeNull();
  });

  it("acepta COMPLETO, que es la pieza entera y la tienen todas", () => {
    for (const fdi of ["11", "16", "31", "46", "51", "85"]) {
      expect(seleccionDeCara(fdi, "COMPLETO")).not.toBeNull();
    }
  });
});
