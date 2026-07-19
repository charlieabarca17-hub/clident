import type { CondicionDental } from "@/lib/odontograma";

type EnmiendaDb = {
  id: string;
  textoAnterior: string | null;
  textoNuevo: string;
  motivo: string;
  creadoEn: Date;
  creadaPor: { usuario: { nombre: string } };
};

type ProcedimientoDb = {
  id: string;
  planItemId: string;
  tratamientoCodigo: string;
  tratamientoNombre: string;
  realizadoEn: Date;
  precioAplicadoCentavos: number;
  estado: "REALIZADO" | "ANULADO";
  notasClinicas: string | null;
  anuladoEn: Date | null;
  motivoAnulacion: string | null;
  creadoEn: Date;
  creadoPorId: string;
  odontologo: { usuario: { nombre: string } };
  dientes: { fdi: number; superficie: string }[];
  enmiendas: EnmiendaDb[];
};

export function toEnmiendaDto(enmienda: EnmiendaDb) {
  return {
    id: enmienda.id,
    textoAnterior: enmienda.textoAnterior,
    textoNuevo: enmienda.textoNuevo,
    motivo: enmienda.motivo,
    creadoEn: enmienda.creadoEn.toISOString(),
    creadaPorNombre: enmienda.creadaPor.usuario.nombre,
  };
}

export function toProcedimientoDto(procedimiento: ProcedimientoDb) {
  return {
    id: procedimiento.id,
    planItemId: procedimiento.planItemId,
    tratamientoCodigo: procedimiento.tratamientoCodigo,
    tratamientoNombre: procedimiento.tratamientoNombre,
    realizadoEn: procedimiento.realizadoEn.toISOString(),
    precioAplicadoCentavos: procedimiento.precioAplicadoCentavos,
    estado: procedimiento.estado,
    notasClinicas: procedimiento.notasClinicas,
    anuladoEn: procedimiento.anuladoEn?.toISOString() ?? null,
    motivoAnulacion: procedimiento.motivoAnulacion,
    creadoEn: procedimiento.creadoEn.toISOString(),
    creadoPorId: procedimiento.creadoPorId,
    odontologoNombre: procedimiento.odontologo.usuario.nombre,
    dientes: procedimiento.dientes.map((d) => ({ fdi: d.fdi, superficie: d.superficie })),
    enmiendas: procedimiento.enmiendas.map(toEnmiendaDto),
  };
}

export type ProcedimientoDto = ReturnType<typeof toProcedimientoDto>;
export type CondicionResultante = CondicionDental;
