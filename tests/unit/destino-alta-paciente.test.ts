import { describe, expect, it } from "vitest";

import { destinoTrasCrearPaciente } from "@/lib/agenda";

/**
 * Al agendar se puede elegir "paciente nuevo": se lo da de alta y se vuelve a la
 * cita con ese paciente ya elegido. El destino se ARMA en el servidor a partir de
 * un marcador fijo; nunca se copia una URL que venga del navegador, porque eso
 * sería una redirección abierta (mandar a alguien a cualquier sitio tras guardar).
 */
describe("a dónde se vuelve después de crear un paciente", () => {
  it("sin marcador de agenda, al expediente del paciente como siempre", () => {
    expect(destinoTrasCrearPaciente("pac_1", "", "")).toBe("/pacientes/pac_1");
  });

  it("desde la agenda, a la nueva cita con el paciente preseleccionado y la misma fecha", () => {
    expect(destinoTrasCrearPaciente("pac_1", "agenda", "2026-09-30")).toBe(
      "/agenda/nueva?pacienteId=pac_1&fecha=2026-09-30",
    );
  });

  it("una fecha imposible o ausente no viaja: la cita arranca en el día de hoy", () => {
    expect(destinoTrasCrearPaciente("pac_1", "agenda", "2026-02-30")).toBe("/agenda/nueva?pacienteId=pac_1");
    expect(destinoTrasCrearPaciente("pac_1", "agenda", "")).toBe("/agenda/nueva?pacienteId=pac_1");
  });

  it("cualquier otro valor del marcador no redirige a ningún otro lado", () => {
    for (const intento of ["https://evil.example", "//evil.example", "/caja", "AGENDA"]) {
      expect(destinoTrasCrearPaciente("pac_1", intento, "2026-09-30")).toBe("/pacientes/pac_1");
    }
  });

  it("el id del paciente se codifica: no puede inyectar parámetros", () => {
    expect(destinoTrasCrearPaciente("a&fecha=x", "agenda", "")).toBe(
      "/agenda/nueva?pacienteId=a%26fecha%3Dx",
    );
  });
});
