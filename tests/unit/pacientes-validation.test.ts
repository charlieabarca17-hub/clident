import { describe, expect, it } from "vitest";

import { CrearPacienteSchema, esMenorDeEdad } from "@/lib/validation/pacientes";

const CONTACTO = { nombre: "Ana López", telefono: "7000-0000" };
const RESPONSABLE = {
  nombre: "Marta López",
  tipoDocumento: "DUI" as const,
  numeroDocumento: "01234567-8",
  telefono: "7000-0000",
  parentesco: "Madre",
};

function pacienteBase(fechaNacimiento: string) {
  return {
    nombres: "Sofía",
    apellidos: "López",
    fechaNacimiento,
    telefono: "7000-0001",
    contactoEmergencia: CONTACTO,
  };
}

describe("validación de paciente", () => {
  it("rechaza un menor sin responsable completo", () => {
    const resultado = CrearPacienteSchema.safeParse(pacienteBase("2015-07-17"));
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((issue) => issue.path[0] === "responsable")).toBe(true);
    }
  });

  it("acepta un menor con responsable, sin DUI y con contacto de emergencia", () => {
    const resultado = CrearPacienteSchema.safeParse({
      ...pacienteBase("2015-07-17"),
      responsable: RESPONSABLE,
    });
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.dui).toBeNull();
  });

  it("mantiene el límite de 18 años según la fecha civil de la clínica", () => {
    const hoy = new Date(Date.UTC(2026, 6, 17));
    expect(esMenorDeEdad(new Date(Date.UTC(2008, 6, 18)), hoy)).toBe(true);
    expect(esMenorDeEdad(new Date(Date.UTC(2008, 6, 17)), hoy)).toBe(false);
  });

  it("normaliza los opcionales vacíos a null y agrega el guion al DUI de nueve dígitos", () => {
    const resultado = CrearPacienteSchema.parse({
      ...pacienteBase("1990-01-20"),
      dui: "012345678",
      correo: "",
      direccion: "",
    });
    expect(resultado).toMatchObject({
      dui: "01234567-8",
      correo: null,
      direccion: null,
      responsable: null,
    });
  });

  it("acepta el DUI vacío como un dato opcional", () => {
    const resultado = CrearPacienteSchema.parse({
      ...pacienteBase("1990-01-20"),
      dui: "",
    });
    expect(resultado.dui).toBeNull();
  });
});
