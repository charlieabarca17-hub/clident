import { describe, expect, it } from "vitest";

import { toPacienteAdministrativoDto } from "@/server/dto/pacientes";

describe("DTO administrativo de paciente", () => {
  it("mantiene contactos necesarios para recepción y nunca expone documentos completos", () => {
    const dto = toPacienteAdministrativoDto({
      id: "paciente-1",
      nombres: "Sofía",
      apellidos: "López",
      fechaNacimiento: new Date("2015-07-17T00:00:00.000Z"),
      telefono: "7000-0001",
      duiEnmascarado: "********-8",
      correo: "sofia@example.com",
      direccion: "San Salvador",
      responsableNombre: "Marta López",
      responsableTelefono: "7000-0000",
      responsableParentesco: "Madre",
      contactoEmergenciaNombre: "Ana López",
      contactoEmergenciaTelefono: "7000-0002",
    });

    expect(dto).toMatchObject({
      duiEnmascarado: "********-8",
      responsable: { nombre: "Marta López", telefono: "7000-0000", parentesco: "Madre" },
    });
    expect(dto).not.toHaveProperty("dui");
    expect(dto.responsable).not.toHaveProperty("numeroDocumento");
  });
});
