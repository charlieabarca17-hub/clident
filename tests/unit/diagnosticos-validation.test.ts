import { describe, expect, it } from "vitest";

import {
  AnularDiagnosticoSchema,
  CrearDiagnosticoSchema,
} from "@/lib/validation/diagnosticos";

const base = {
  pacienteId: "pac_1",
  descripcion: "Pulpitis irreversible",
  notas: "",
  alcance: "DIENTE" as const,
  dientes: [{ fdi: 26, superficie: "OCLUSAL" as const }],
};

describe("CrearDiagnosticoSchema", () => {
  it("acepta un diagnóstico por pieza con varias caras del mismo diente", () => {
    const resultado = CrearDiagnosticoSchema.parse({
      ...base,
      dientes: [
        { fdi: 26, superficie: "MESIAL" },
        { fdi: 26, superficie: "OCLUSAL" },
        { fdi: 27, superficie: "COMPLETO" },
      ],
    });
    expect(resultado.dientes).toHaveLength(3);
    expect(resultado.notas).toBeNull();
  });

  it("acepta un diagnóstico general sin piezas", () => {
    const resultado = CrearDiagnosticoSchema.parse({
      ...base,
      descripcion: "Bruxismo",
      alcance: "PACIENTE",
      dientes: [],
    });
    expect(resultado.dientes).toEqual([]);
  });

  it("rechaza un diagnóstico general que trae piezas", () => {
    expect(() =>
      CrearDiagnosticoSchema.parse({ ...base, alcance: "PACIENTE" }),
    ).toThrow(/general del paciente/i);
  });

  it("rechaza un diagnóstico por pieza sin piezas", () => {
    expect(() => CrearDiagnosticoSchema.parse({ ...base, dientes: [] })).toThrow(/al menos una pieza/i);
  });

  it("rechaza una cara que la pieza no tiene: el 11 no tiene OCLUSAL", () => {
    expect(() =>
      CrearDiagnosticoSchema.parse({ ...base, dientes: [{ fdi: 11, superficie: "OCLUSAL" }] }),
    ).toThrow(/no tiene la cara/i);
  });

  it("rechaza una pieza que no existe en FDI y una repetida", () => {
    expect(() =>
      CrearDiagnosticoSchema.parse({ ...base, dientes: [{ fdi: 99, superficie: "COMPLETO" }] }),
    ).toThrow(/no existe/i);
    expect(() =>
      CrearDiagnosticoSchema.parse({
        ...base,
        dientes: [
          { fdi: 26, superficie: "OCLUSAL" },
          { fdi: 26, superficie: "OCLUSAL" },
        ],
      }),
    ).toThrow(/repetida/i);
  });
});

describe("AnularDiagnosticoSchema", () => {
  it("exige el motivo", () => {
    expect(() =>
      AnularDiagnosticoSchema.parse({ pacienteId: "p", diagnosticoId: "d", motivoAnulacion: "  " }),
    ).toThrow();
    const resultado = AnularDiagnosticoSchema.parse({
      pacienteId: "p",
      diagnosticoId: "d",
      motivoAnulacion: "Registrado en el paciente equivocado.",
    });
    expect(resultado.motivoAnulacion).toContain("equivocado");
  });
});
