import { describe, expect, it } from "vitest";

import { CrearCitaSchema, ReprogramarCitaSchema } from "@/lib/validation/citas";

const BASE = {
  pacienteId: "paciente-prueba",
  odontologoId: "odontologo-prueba",
  fecha: "2026-07-17",
  hora: "10:30",
  duracionMinutos: "30",
};

describe("validación de Agenda", () => {
  it("convierte la hora civil de El Salvador a timestamptz y calcula el fin", () => {
    const cita = CrearCitaSchema.parse(BASE);
    expect(cita.inicioEn.toISOString()).toBe("2026-07-17T16:30:00.000Z");
    expect(cita.finEn.toISOString()).toBe("2026-07-17T17:00:00.000Z");
    expect(cita.motivo).toBeNull();
    expect(cita.notasAdministrativas).toBeNull();
  });

  it("rechaza fecha inexistente, hora inválida y duración fuera del límite", () => {
    expect(CrearCitaSchema.safeParse({ ...BASE, fecha: "2026-02-29" }).success).toBe(false);
    expect(CrearCitaSchema.safeParse({ ...BASE, hora: "24:00" }).success).toBe(false);
    expect(CrearCitaSchema.safeParse({ ...BASE, duracionMinutos: "0" }).success).toBe(false);
    expect(CrearCitaSchema.safeParse({ ...BASE, duracionMinutos: "481" }).success).toBe(false);
  });

  it("normaliza notas vacías y permite reprogramar sin reenviar paciente ni odontólogo", () => {
    const cita = CrearCitaSchema.parse({ ...BASE, motivo: "  ", notasAdministrativas: "  " });
    expect(cita).toMatchObject({ motivo: null, notasAdministrativas: null });
    expect(ReprogramarCitaSchema.parse({ fecha: BASE.fecha, hora: BASE.hora, duracionMinutos: 15 }))
      .toMatchObject({ fecha: BASE.fecha, hora: BASE.hora, duracionMinutos: 15 });
  });
});
