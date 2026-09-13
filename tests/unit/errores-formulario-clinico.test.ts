import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ESTADO_INICIAL,
  MENSAJE_RESULTADO_INCIERTO,
  errorAlGuardar,
  errorDeFormulario,
  mensajesDeError,
  valoresDelFormulario,
} from "@/lib/formulario";
import { ErrorReglaClinica } from "@/lib/errors";
import { RegistrarCondicionSchema } from "@/lib/validation/odontograma";
import { RealizarProcedimientoSchema } from "@/lib/validation/procedimientos";

// Ciclo 19. Antes, las acciones clínicas hacían `.parse()`, que lanza. Sin ningún
// `error.tsx` en la aplicación, el profesional caía en la pantalla genérica de Next
// y perdía todo lo escrito — incluida la nota clínica.
//
// QUÉ COMPRUEBAN ESTAS PRUEBAS, EXACTAMENTE: los esquemas de validación y las
// funciones auxiliares que arman el estado del formulario. Es decir, la lógica que
// decide QUÉ mensaje se produce y QUÉ valores se conservan.
//
// QUÉ NO COMPRUEBAN: el envío completo del formulario. No se ejecuta la Server
// Action, no se monta el componente, no se verifica que `useActionState` repinte
// los valores en el navegador, ni que el `redirect` de éxito ocurra. Eso exigiría
// Testing Library o un navegador, que el proyecto no tiene a propósito
// (`docs/ARQUITECTURA.md` §17). El cableado del JSX está verificado por lectura.

const CONDICION_BASE = { pacienteId: "p1", fdi: "26", superficie: "OCLUSAL", condicion: "CARIES" };
const PROCEDIMIENTO_BASE = { pacienteId: "p1", planItemId: "pi1", dientes: [] };

/** Un instante futuro, escrito como lo manda un `datetime-local`. */
function manana(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

describe("caso 1 · fecha futura", () => {
  it("odontograma: el mensaje que ve el profesional dice qué campo y por qué", () => {
    const analisis = RegistrarCondicionSchema.safeParse({ ...CONDICION_BASE, ocurridoEn: manana() });
    expect(analisis.success).toBe(false);

    const mensajes = mensajesDeError(analisis.error!);
    expect(mensajes).toContain("Fecha del hallazgo: El hallazgo no puede estar en el futuro.");
  });

  it("procedimientos: ídem, con su propio mensaje", () => {
    const analisis = RealizarProcedimientoSchema.safeParse({ ...PROCEDIMIENTO_BASE, realizadoEn: manana() });
    expect(analisis.success).toBe(false);

    const mensajes = mensajesDeError(analisis.error!);
    expect(mensajes).toContain("Fecha y hora: Un procedimiento no puede realizarse en el futuro.");
  });
});

describe("caso 2 · dato clínico inválido", () => {
  it("una pieza que no existe en notación FDI se explica en español", () => {
    const analisis = RegistrarCondicionSchema.safeParse({ ...CONDICION_BASE, fdi: "99" });
    expect(analisis.success).toBe(false);
    expect(mensajesDeError(analisis.error!).join(" ")).toContain("no existe en notación FDI");
  });

  it("una cara que esa pieza no tiene se explica en español", () => {
    // El 11 es un incisivo: no tiene cara oclusal.
    const analisis = RegistrarCondicionSchema.safeParse({ ...CONDICION_BASE, fdi: "11" });
    expect(analisis.success).toBe(false);
    expect(mensajesDeError(analisis.error!).join(" ")).toContain("no tiene la cara");
  });

  it("indicar piezas sin decir cómo quedan se explica en español", () => {
    const analisis = RealizarProcedimientoSchema.safeParse({
      ...PROCEDIMIENTO_BASE,
      dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
      condicionResultante: null,
    });
    expect(analisis.success).toBe(false);
    expect(mensajesDeError(analisis.error!).join(" ")).toContain("Indicá con qué condición queda");
  });

  it("no repite el mismo mensaje aunque el problema venga dos veces", () => {
    const analisis = RealizarProcedimientoSchema.safeParse({
      ...PROCEDIMIENTO_BASE,
      dientes: [{ fdi: 99, superficie: "OCLUSAL" }, { fdi: 99, superficie: "MESIAL" }],
      condicionResultante: "OBTURACION",
    });
    expect(analisis.success).toBe(false);
    const mensajes = mensajesDeError(analisis.error!);
    expect(new Set(mensajes).size).toBe(mensajes.length);
  });
});

describe("caso 3 · corrección y envío exitoso", () => {
  it("odontograma: corregida la fecha, el mismo dato ya es válido", () => {
    const malo = RegistrarCondicionSchema.safeParse({ ...CONDICION_BASE, ocurridoEn: manana() });
    expect(malo.success).toBe(false);

    const bueno = RegistrarCondicionSchema.safeParse({ ...CONDICION_BASE, ocurridoEn: "2026-06-01T09:30" });
    expect(bueno.success).toBe(true);
    expect(bueno.data!.ocurridoEn.toISOString()).toBe("2026-06-01T15:30:00.000Z");
  });

  it("procedimientos: corregida la condición resultante, el mismo dato ya es válido", () => {
    const malo = RealizarProcedimientoSchema.safeParse({
      ...PROCEDIMIENTO_BASE,
      dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
      condicionResultante: null,
    });
    expect(malo.success).toBe(false);

    const bueno = RealizarProcedimientoSchema.safeParse({
      ...PROCEDIMIENTO_BASE,
      dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
      condicionResultante: "OBTURACION",
      notasClinicas: "Se obtura la oclusal del 26.",
    });
    expect(bueno.success).toBe(true);
    expect(bueno.data!.notasClinicas).toBe("Se obtura la oclusal del 26.");
  });
});

describe("caso 4 · no se pierde lo escrito, y no se filtra nada", () => {
  const NOTA = "Paciente refiere dolor a la percusión. Se obtura la oclusal del 26.";

  function formularioDeProcedimiento(): FormData {
    const formData = new FormData();
    formData.set("pacienteId", "p1");
    formData.set("planItemId", "pi1");
    formData.set("realizadoEn", manana());
    formData.set("notasClinicas", NOTA);
    formData.set("condicionResultante", "OBTURACION");
    formData.set("diente-0", "26");
    formData.set("superficie-0", "OCLUSAL");
    return formData;
  }

  it("la nota clínica vuelve intacta al formulario", () => {
    const valores = valoresDelFormulario(formularioDeProcedimiento(), [
      "planItemId", "realizadoEn", "notasClinicas", "condicionResultante", "diente-0", "superficie-0",
    ]);
    expect(valores.notasClinicas).toBe(NOTA);
  });

  it("también vuelven las piezas ya elegidas: no hay que rehacer la selección", () => {
    const valores = valoresDelFormulario(formularioDeProcedimiento(), ["diente-0", "superficie-0"]);
    expect(valores["diente-0"]).toBe("26");
    expect(valores["superficie-0"]).toBe("OCLUSAL");
  });

  it("solo se devuelven los campos pedidos: nada de otra clínica ni campos que nadie pidió", () => {
    const formData = formularioDeProcedimiento();
    formData.set("clinicaId", "clinica-ajena");
    formData.set("pacienteId", "p1");

    const valores = valoresDelFormulario(formData, ["notasClinicas"]);

    expect(Object.keys(valores)).toEqual(["notasClinicas"]);
    expect(JSON.stringify(valores)).not.toContain("clinica-ajena");
  });

  it("un campo ausente no aparece inventado como cadena vacía", () => {
    const valores = valoresDelFormulario(new FormData(), ["notasClinicas"]);
    expect(valores).toEqual({});
  });

  it("el error inesperado no revela nada interno", () => {
    const estado = errorDeFormulario([MENSAJE_RESULTADO_INCIERTO], { notasClinicas: NOTA });

    expect(estado.mensajes).toEqual([MENSAJE_RESULTADO_INCIERTO]);
    for (const filtracion of ["prisma", "PostgreSQL", "Error:", "at ", "clinica_id", "select"]) {
      expect(MENSAJE_RESULTADO_INCIERTO.toLowerCase()).not.toContain(filtracion.toLowerCase());
    }
    expect(estado.valores.notasClinicas).toBe(NOTA);
  });

  it("el estado inicial no trae mensajes ni valores", () => {
    expect(ESTADO_INICIAL.estado).toBe("inicial");
    expect(ESTADO_INICIAL.mensajes).toHaveLength(0);
    expect(ESTADO_INICIAL.valores).toEqual({});
  });
});

describe("caso 5 · las reglas clínicas del repositorio, TODAS", () => {
  const NOTA = "Se obtura la oclusal del 26.";

  // Los mensajes NO se copian a mano acá: se extraen del código fuente. Una lista
  // escrita a mano se desincroniza el día que alguien agrega la regla número 12,
  // y esa regla nueva podría filtrar el nombre de una tabla sin que nada avise.
  // Es la prueba estructural que `docs/ARQUITECTURA.md` §17 promete.
  const FUENTES = ["src/server/db/odontograma.ts", "src/server/db/procedimientos.ts"];

  function reglasDelCodigo(): ReadonlyArray<{ archivo: string; mensaje: string }> {
    const encontradas: Array<{ archivo: string; mensaje: string }> = [];
    for (const archivo of FUENTES) {
      const fuente = readFileSync(join(process.cwd(), archivo), "utf8");
      for (const hallazgo of fuente.matchAll(/new ErrorReglaClinica\(\s*(["`])([^"`]*)\1/g)) {
        // El único mensaje con interpolación mete un estado de plan, no un id.
        encontradas.push({ archivo, mensaje: hallazgo[2].replace(/\$\{[^}]*\}/g, "EN_PROCESO") });
      }
    }
    return encontradas;
  }

  const REGLAS = reglasDelCodigo();

  it("hay 11 reglas clínicas y todas se extrajeron del código", () => {
    expect(REGLAS).toHaveLength(11);
  });

  it.each(REGLAS.map((r) => [r.mensaje]))("se le muestra al profesional tal cual: %s", (mensaje) => {
    const estado = errorAlGuardar(new ErrorReglaClinica(mensaje), { notasClinicas: NOTA });

    expect(estado.mensajes).toEqual([mensaje]);
    expect(estado.valores.notasClinicas).toBe(NOTA);
  });

  it.each(REGLAS.map((r) => [r.mensaje]))("no filtra SQL, tablas ni ids: %s", (mensaje) => {
    for (const filtracion of ["prisma", "select ", "insert ", "clinica_id", "constraint", "Error:", " at "]) {
      expect(mensaje.toLowerCase()).not.toContain(filtracion.toLowerCase());
    }
    expect(mensaje).not.toMatch(/\b[a-z0-9]{20,}\b/);
  });

  it.each(REGLAS.map((r) => [r.mensaje]))("es una frase en español terminada en punto: %s", (mensaje) => {
    expect(mensaje.length).toBeGreaterThan(15);
    expect(mensaje.trimEnd().endsWith(".")).toBe(true);
  });

  it("ninguna regla pide algo que el formulario no permite hacer", () => {
    // "Elegí una sede" era imposible de cumplir: el formulario no tiene selector
    // de sede y la interfaz de sucursales está fuera de alcance (FLUJO §7).
    const sede = REGLAS.find((r) => r.mensaje.includes("sede"));
    expect(sede).toBeDefined();
    expect(sede!.mensaje).not.toMatch(/^Elegí una sede/);
    expect(sede!.mensaje).toContain("todavía no permite elegirla");
    expect(sede!.mensaje).toContain("avisá a quien administra");
  });
});

describe("caso 6 · resultado incierto: no se invita a duplicar un hecho clínico", () => {
  it("un fallo que NO es regla clínica no muestra el error crudo", () => {
    const crudo = new Error(
      'Invalid `prisma.eventoOdontograma.create()`: constraint "eventos_odontograma_pkey" en clinica_id=abc',
    );

    const estado = errorAlGuardar(crudo, { notasClinicas: "Nota" });

    expect(estado.mensajes).toEqual([MENSAJE_RESULTADO_INCIERTO]);
    expect(JSON.stringify(estado.mensajes)).not.toContain("prisma");
    expect(JSON.stringify(estado.mensajes)).not.toContain("clinica_id");
    expect(JSON.stringify(estado.mensajes)).not.toContain("eventos_odontograma_pkey");
  });

  it("el mensaje NO invita a reintentar a ciegas: avisa de revisar antes", () => {
    // Una transacción hace la escritura atómica, pero si el COMMIT ocurrió y la
    // respuesta se perdió, el hecho quedó registrado y acá igual se ve un error.
    expect(MENSAJE_RESULTADO_INCIERTO).toContain("revisá la historia");
    expect(MENSAJE_RESULTADO_INCIERTO).toContain("no lo registrés de nuevo");
    expect(MENSAJE_RESULTADO_INCIERTO).not.toMatch(/^Volvé a intentarlo/);
  });

  it("lo escrito se conserva también cuando el resultado es incierto", () => {
    const estado = errorAlGuardar(new Error("lo que sea"), { notasClinicas: "Nota larga" });
    expect(estado.valores.notasClinicas).toBe("Nota larga");
  });
});
