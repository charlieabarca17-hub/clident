type EstadoCita = "PENDIENTE" | "CANCELADA";

const FORMATO_HORA = new Intl.DateTimeFormat("es-SV", {
  timeZone: "America/El_Salvador",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type CitaAgendaDb = {
  id: string;
  inicioEn: Date;
  finEn: Date;
  estado: EstadoCita;
  motivo: string | null;
  notasAdministrativas: string | null;
  paciente: { id: string; nombres: string; apellidos: string };
  odontologo: { id: string; colorAgenda: string | null; usuario: { nombre: string } };
};

export function toCitaAgendaDto(cita: CitaAgendaDb) {
  return {
    id: cita.id,
    inicioEn: cita.inicioEn.toISOString(),
    finEn: cita.finEn.toISOString(),
    horaInicio: FORMATO_HORA.format(cita.inicioEn),
    horaFin: FORMATO_HORA.format(cita.finEn),
    estado: cita.estado,
    motivo: cita.motivo,
    notasAdministrativas: cita.notasAdministrativas,
    paciente: {
      id: cita.paciente.id,
      nombreCompleto: `${cita.paciente.nombres} ${cita.paciente.apellidos}`,
    },
    odontologo: {
      id: cita.odontologo.id,
      nombre: cita.odontologo.usuario.nombre,
      colorAgenda: cita.odontologo.colorAgenda,
    },
  } as const;
}
