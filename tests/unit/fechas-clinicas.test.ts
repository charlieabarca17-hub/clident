import { describe, expect, it } from "vitest";

import { RegistrarCondicionSchema } from "@/lib/validation/odontograma";
import { RealizarProcedimientoSchema } from "@/lib/validation/procedimientos";
import { instanteDesdeFechaHoraLocal } from "@/lib/validation/fecha-hora";

// Regresión del Ciclo 18. Los `<input type="datetime-local">` del odontograma y de
// procedimientos mandan "2026-06-01T09:30" SIN zona horaria. `new Date()` sobre esa
// cadena usa la zona del SERVIDOR: en Vercel (UTC) las 9:30 de San Salvador se
// guardaban como 09:30Z, seis horas antes de cuando ocurrieron.
//
// Estas pruebas afirman contra `toISOString()`, que es el instante absoluto: el
// mismo número en cualquier zona. Por eso NO usan getFullYear() ni getHours(), que
// leen la zona del proceso y harían pasar la prueba por accidente. La suite corre
// además con TZ=UTC y con TZ=America/El_Salvador, y debe dar idéntico.

/** El Salvador es UTC-6 fijo, sin horario de verano: la hora civil + 6 h = UTC. */
// Todos los casos son PASADOS a propósito: los esquemas clínicos prohíben registrar
// un hecho futuro, así que una fecha futura acá haría fallar la prueba por el motivo
// equivocado. (La primera versión de este archivo usaba 2026-12-31 y falló por eso.)
const CASOS: ReadonlyArray<readonly [string, string]> = [
  // [lo que teclea el personal, el instante UTC correcto]
  ["2026-06-01T09:30", "2026-06-01T15:30:00.000Z"], // el caso del hallazgo
  ["2026-06-01T00:15", "2026-06-01T06:15:00.000Z"], // recién pasada la medianoche civil
  ["2026-06-01T23:30", "2026-06-02T05:30:00.000Z"], // cerca de medianoche: cambia de día en UTC
  ["2026-06-01T18:00", "2026-06-02T00:00:00.000Z"], // las 6 p.m. civiles SON medianoche UTC
  ["2025-12-31T23:59", "2026-01-01T05:59:00.000Z"], // fin de año: cambia de año en UTC
  ["2026-01-15T00:00", "2026-01-15T06:00:00.000Z"], // medianoche civil exacta
];

describe("instanteDesdeFechaHoraLocal", () => {
  it.each(CASOS)("%s (hora de El Salvador) es el instante %s", (tecleado, esperado) => {
    expect(instanteDesdeFechaHoraLocal(tecleado)?.toISOString()).toBe(esperado);
  });

  // Una versión anterior aceptaba segundos y después convertía solo con HH:mm:
  // "09:30:45" se guardaba como 09:30:00 sin avisar, y ":99" también pasaba.
  // Recortar en silencio es peor que rechazar: el expediente termina diciendo una
  // hora que nadie escribió.
  it.each([":00", ":45", ":99"])("rechaza un valor con segundos (%s) en vez de recortarlo", (segundos) => {
    expect(instanteDesdeFechaHoraLocal(`2026-06-01T09:30${segundos}`)).toBeNull();
  });

  it("la precisión guardada es exactamente la que se tecleó: minutos", () => {
    // Si algún día alguien acepta segundos, esta prueba lo obliga a decidirlo
    // explícitamente en vez de que el recorte vuelva a colarse.
    expect(instanteDesdeFechaHoraLocal("2026-06-01T09:30")?.toISOString())
      .toBe("2026-06-01T15:30:00.000Z");
  });

  it("rechaza fechas civiles imposibles", () => {
    expect(instanteDesdeFechaHoraLocal("2026-02-30T10:00")).toBeNull();
    expect(instanteDesdeFechaHoraLocal("2026-13-01T10:00")).toBeNull();
    expect(instanteDesdeFechaHoraLocal("2025-02-29T10:00")).toBeNull(); // 2025 no es bisiesto
  });

  it("acepta el 29 de febrero de un año bisiesto", () => {
    expect(instanteDesdeFechaHoraLocal("2028-02-29T10:00")?.toISOString())
      .toBe("2028-02-29T16:00:00.000Z");
  });

  it("rechaza horas imposibles", () => {
    expect(instanteDesdeFechaHoraLocal("2026-06-01T25:00")).toBeNull();
    expect(instanteDesdeFechaHoraLocal("2026-06-01T10:60")).toBeNull();
  });

  it("rechaza formas que no son un datetime-local", () => {
    for (const basura of ["", "   ", "2026-06-01", "ayer", "2026-06-01 09:30", "2026-6-1T9:30"]) {
      expect(instanteDesdeFechaHoraLocal(basura)).toBeNull();
    }
  });
});

const CONDICION_BASE = { pacienteId: "p1", fdi: 26, superficie: "OCLUSAL", condicion: "CARIES" };
const PROCEDIMIENTO_BASE = { pacienteId: "p1", planItemId: "pi1", dientes: [] };

describe("odontograma: el hallazgo se fecha en hora de El Salvador", () => {
  it.each(CASOS)("ocurridoEn %s se guarda como %s", (tecleado, esperado) => {
    const resultado = RegistrarCondicionSchema.parse({ ...CONDICION_BASE, ocurridoEn: tecleado });
    expect(resultado.ocurridoEn.toISOString()).toBe(esperado);
  });

  it("campo vacío = ahora", () => {
    const antes = Date.now();
    const resultado = RegistrarCondicionSchema.parse({ ...CONDICION_BASE, ocurridoEn: "" });
    expect(resultado.ocurridoEn.getTime()).toBeGreaterThanOrEqual(antes);
    expect(resultado.ocurridoEn.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("campo ausente = ahora", () => {
    const antes = Date.now();
    const resultado = RegistrarCondicionSchema.parse(CONDICION_BASE);
    expect(resultado.ocurridoEn.getTime()).toBeGreaterThanOrEqual(antes);
    expect(resultado.ocurridoEn.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("una fecha imposible se rechaza con su mensaje", () => {
    const resultado = RegistrarCondicionSchema.safeParse({ ...CONDICION_BASE, ocurridoEn: "2026-02-30T10:00" });
    expect(resultado.success).toBe(false);
    expect(JSON.stringify(resultado.error?.issues)).toContain("La fecha del hallazgo no es válida.");
  });

  it("un hallazgo en el futuro se rechaza", () => {
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const resultado = RegistrarCondicionSchema.safeParse({ ...CONDICION_BASE, ocurridoEn: manana });
    expect(resultado.success).toBe(false);
    expect(JSON.stringify(resultado.error?.issues)).toContain("El hallazgo no puede estar en el futuro.");
  });

  it("un hallazgo retroactivo se acepta: sigue existiendo el registro de una radiografía vieja", () => {
    const resultado = RegistrarCondicionSchema.parse({ ...CONDICION_BASE, ocurridoEn: "2026-06-01T09:30" });
    expect(resultado.ocurridoEn.toISOString()).toBe("2026-06-01T15:30:00.000Z");
  });
});

describe("procedimientos: la sesión se fecha en hora de El Salvador", () => {
  it.each(CASOS)("realizadoEn %s se guarda como %s", (tecleado, esperado) => {
    const resultado = RealizarProcedimientoSchema.parse({ ...PROCEDIMIENTO_BASE, realizadoEn: tecleado });
    expect(resultado.realizadoEn.toISOString()).toBe(esperado);
  });

  it("campo vacío = ahora", () => {
    const antes = Date.now();
    const resultado = RealizarProcedimientoSchema.parse({ ...PROCEDIMIENTO_BASE, realizadoEn: "" });
    expect(resultado.realizadoEn.getTime()).toBeGreaterThanOrEqual(antes);
    expect(resultado.realizadoEn.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("una fecha imposible se rechaza con su mensaje", () => {
    const resultado = RealizarProcedimientoSchema.safeParse({ ...PROCEDIMIENTO_BASE, realizadoEn: "2026-06-01T25:00" });
    expect(resultado.success).toBe(false);
    expect(JSON.stringify(resultado.error?.issues)).toContain("La fecha no es válida.");
  });

  it("un procedimiento en el futuro se rechaza", () => {
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const resultado = RealizarProcedimientoSchema.safeParse({ ...PROCEDIMIENTO_BASE, realizadoEn: manana });
    expect(resultado.success).toBe(false);
    expect(JSON.stringify(resultado.error?.issues)).toContain("Un procedimiento no puede realizarse en el futuro.");
  });
});

describe("el resultado no depende de la zona horaria del servidor", () => {
  it("TZ del proceso: el instante calculado es el mismo sin importar cuál sea", () => {
    // Si esta prueba se ejecuta bajo TZ=UTC y bajo TZ=America/El_Salvador y da lo
    // mismo, es porque la conversión usa el desfase explícito y no el del proceso.
    // El valor esperado está escrito a mano, no derivado de `Date`.
    expect(instanteDesdeFechaHoraLocal("2026-06-01T09:30")?.getTime())
      .toBe(Date.parse("2026-06-01T15:30:00.000Z"));
  });
});
