import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * El tema oscuro está declarado dos veces en globals.css: una en `.dark` y
 * otra en `@media (prefers-color-scheme: dark)`. CSS no permite compartir un
 * cuerpo entre un selector y un media query, y la alternativa —una capa de
 * variables `--oscuro-*` -> mapeo— es más difícil de leer que el problema que
 * resuelve.
 *
 * El riesgo de duplicar es que deriven: alguien ajusta un color en un bloque,
 * no en el otro, y entonces la aplicación se ve distinta según si el tema
 * oscuro entró por la clase o por la preferencia del sistema. Es un bug que
 * nadie reporta porque cada quien ve solo una de las dos ramas.
 *
 * Esta prueba lo vuelve imposible: los dos bloques tienen que ser idénticos.
 */

const CSS = readFileSync(
  fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)),
  "utf8",
);

const INICIO = "/* --- INICIO TEMA OSCURO --- */";
const FIN = "/* --- FIN TEMA OSCURO --- */";

function bloquesOscuros(): string[] {
  const bloques: string[] = [];
  let desde = 0;
  for (;;) {
    const a = CSS.indexOf(INICIO, desde);
    if (a === -1) break;
    const b = CSS.indexOf(FIN, a);
    expect(b, "un bloque de tema oscuro quedó sin su marca de cierre").toBeGreaterThan(a);
    bloques.push(CSS.slice(a + INICIO.length, b));
    desde = b + FIN.length;
  }
  return bloques;
}

/** Quita indentación y saltos: los dos bloques viven a distinta profundidad. */
function normalizar(bloque: string): string {
  return bloque
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
    .join("\n");
}

describe("tema oscuro", () => {
  it("está declarado exactamente dos veces", () => {
    // Si algún día se elimina la duplicación (por ejemplo con un interruptor
    // real y una sola fuente), esta prueba avisa en vez de quedar mintiendo.
    expect(bloquesOscuros()).toHaveLength(2);
  });

  it("los dos bloques son idénticos", () => {
    const [porClase, porPreferenciaDelSistema] = bloquesOscuros().map(normalizar);
    expect(porPreferenciaDelSistema).toBe(porClase);
  });

  it("declara color-scheme para que los controles nativos acompañen", () => {
    // Sin esto los <select> y el calendario del odontograma salen blancos
    // sobre el fondo oscuro.
    for (const bloque of bloquesOscuros()) {
      expect(bloque).toContain("color-scheme: dark");
    }
    expect(CSS).toContain("color-scheme: light");
  });

  it("no reintroduce texto blanco sobre el rosa de los botones", () => {
    // La decisión de contraste aprobada no depende del tema: rosa + ciruela
    // da 5.38:1, rosa + blanco da 2.39:1 y reprueba WCAG AA.
    for (const bloque of bloquesOscuros()) {
      expect(bloque).not.toMatch(/--primary-foreground:\s*(#fff|#ffffff|white)/i);
    }
  });
});
