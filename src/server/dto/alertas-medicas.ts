type AlertaMedicaDb = {
  id: string;
  titulo: string;
  detalle: string | null;
  creadoEn: Date;
  creadaPor: { usuario: { nombre: string } };
};

/** DTO clínico: se construye únicamente detrás de clinico:read. */
export function toAlertaMedicaDto(alerta: AlertaMedicaDb) {
  return {
    id: alerta.id,
    titulo: alerta.titulo,
    detalle: alerta.detalle,
    creadaEn: alerta.creadoEn.toISOString(),
    creadaPorNombre: alerta.creadaPor.usuario.nombre,
  } as const;
}
