import type { CondicionDental, TipoEventoOdontograma } from "@/lib/odontograma";

type SuperficieDb =
  | "COMPLETO"
  | "MESIAL"
  | "DISTAL"
  | "VESTIBULAR"
  | "PALATINA"
  | "LINGUAL"
  | "INCISAL"
  | "OCLUSAL";

type EstadoSuperficieDb = {
  fdi: number;
  superficie: SuperficieDb;
  condicion: CondicionDental;
  tratamientoPendiente: boolean;
  ultimoEventoEn: Date;
};

type EventoOdontogramaDb = {
  id: string;
  fdi: number;
  superficie: SuperficieDb;
  tipo: TipoEventoOdontograma;
  condicion: CondicionDental | null;
  ocurridoEn: Date;
  creadoEn: Date;
  anulaEventoId: string | null;
  motivoAnulacion: string | null;
  registradoPor: { usuario: { nombre: string } };
};

export function toEstadoSuperficieDto(estado: EstadoSuperficieDb) {
  return {
    fdi: estado.fdi,
    superficie: estado.superficie,
    condicion: estado.condicion,
    tratamientoPendiente: estado.tratamientoPendiente,
    ultimoEventoEn: estado.ultimoEventoEn.toISOString(),
  };
}

export type EstadoSuperficieDto = ReturnType<typeof toEstadoSuperficieDto>;

export function toEventoOdontogramaDto(evento: EventoOdontogramaDb) {
  return {
    id: evento.id,
    fdi: evento.fdi,
    superficie: evento.superficie,
    tipo: evento.tipo,
    condicion: evento.condicion,
    ocurridoEn: evento.ocurridoEn.toISOString(),
    creadoEn: evento.creadoEn.toISOString(),
    anulaEventoId: evento.anulaEventoId,
    motivoAnulacion: evento.motivoAnulacion,
    registradoPorNombre: evento.registradoPor.usuario.nombre,
  };
}

export type EventoOdontogramaDto = ReturnType<typeof toEventoOdontogramaDto>;
