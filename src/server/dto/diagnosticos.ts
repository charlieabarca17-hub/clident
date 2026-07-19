type DienteDiagnosticoDb = {
  fdi: number;
  superficie:
    | "COMPLETO"
    | "MESIAL"
    | "DISTAL"
    | "VESTIBULAR"
    | "PALATINA"
    | "LINGUAL"
    | "INCISAL"
    | "OCLUSAL";
};

type DiagnosticoDb = {
  id: string;
  descripcion: string;
  notas: string | null;
  alcance: "DIENTE" | "PACIENTE";
  creadoEn: Date;
  anuladoEn: Date | null;
  motivoAnulacion: string | null;
  registradoPor: { usuario: { nombre: string } };
  anuladoPor: { usuario: { nombre: string } } | null;
  dientes: DienteDiagnosticoDb[];
};

export function toDiagnosticoDto(diagnostico: DiagnosticoDb) {
  return {
    id: diagnostico.id,
    descripcion: diagnostico.descripcion,
    notas: diagnostico.notas,
    alcance: diagnostico.alcance,
    creadoEn: diagnostico.creadoEn.toISOString(),
    registradoPorNombre: diagnostico.registradoPor.usuario.nombre,
    anulado: diagnostico.anuladoEn !== null,
    anuladoEn: diagnostico.anuladoEn?.toISOString() ?? null,
    anuladoPorNombre: diagnostico.anuladoPor?.usuario.nombre ?? null,
    motivoAnulacion: diagnostico.motivoAnulacion,
    dientes: diagnostico.dientes.map((diente) => ({
      fdi: diente.fdi,
      superficie: diente.superficie,
    })),
  };
}

export type DiagnosticoDto = ReturnType<typeof toDiagnosticoDto>;
