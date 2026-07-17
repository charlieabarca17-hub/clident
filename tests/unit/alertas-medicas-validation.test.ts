import { describe, expect, it } from "vitest";

import {
  CrearAlertaMedicaSchema,
  DesactivarAlertaMedicaSchema,
} from "@/lib/validation/alertas-medicas";

describe("validación de alertas médicas", () => {
  it("normaliza detalle vacío y conserva una alerta clínica concreta", () => {
    const alerta = CrearAlertaMedicaSchema.parse({
      pacienteId: "paciente-1",
      titulo: "  Alergia a penicilina  ",
      detalle: " ",
    });
    expect(alerta).toEqual({ pacienteId: "paciente-1", titulo: "Alergia a penicilina", detalle: null });
  });

  it("exige texto para crear y para desactivar una alerta", () => {
    expect(CrearAlertaMedicaSchema.safeParse({ pacienteId: "paciente-1", titulo: " " }).success).toBe(false);
    expect(DesactivarAlertaMedicaSchema.safeParse({ motivoDesactivacion: " " }).success).toBe(false);
  });
});
