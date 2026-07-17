type PacienteListadoDb = {
  id: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: Date;
  telefono: string;
  duiEnmascarado: string | null;
};

type PacienteDetalleDb = PacienteListadoDb & {
  dui: string | null;
  correo: string | null;
  direccion: string | null;
  responsableNombre: string | null;
  responsableTipoDocumento: "DUI" | "PASAPORTE" | "CARNET_RESIDENTE" | null;
  responsableNumDocumento: string | null;
  responsableTelefono: string | null;
  responsableParentesco: string | null;
  contactoEmergenciaNombre: string;
  contactoEmergenciaTelefono: string;
};

function fechaCivil(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** DTO de selector/listado: el DUI completo nunca entra en esta frontera. */
export function toPacienteListadoDto(paciente: PacienteListadoDb) {
  return {
    id: paciente.id,
    nombres: paciente.nombres,
    apellidos: paciente.apellidos,
    fechaNacimiento: fechaCivil(paciente.fechaNacimiento),
    telefono: paciente.telefono,
    duiEnmascarado: paciente.duiEnmascarado,
  } as const;
}

/** Solo llega desde getPacienteDetalle(), que exige paciente:read_pii y deja auditoría. */
export function toPacienteDetalleDto(paciente: PacienteDetalleDb) {
  return {
    ...toPacienteListadoDto(paciente),
    dui: paciente.dui,
    correo: paciente.correo,
    direccion: paciente.direccion,
    responsable: paciente.responsableNombre === null ? null : {
      nombre: paciente.responsableNombre,
      tipoDocumento: paciente.responsableTipoDocumento,
      numeroDocumento: paciente.responsableNumDocumento,
      telefono: paciente.responsableTelefono,
      parentesco: paciente.responsableParentesco,
    },
    contactoEmergencia: {
      nombre: paciente.contactoEmergenciaNombre,
      telefono: paciente.contactoEmergenciaTelefono,
    },
  } as const;
}
