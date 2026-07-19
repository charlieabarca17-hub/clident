/**
 * Ventana de edición directa de la nota clínica de un procedimiento (§9).
 *
 * Límite declarado y consciente (ARQUITECTURA §10.5): la ventana NO es
 * expresable ni por privilegio ni por CHECK (un CHECK no puede usar now() de
 * forma útil). Vive acá, con prueba. Es la excepción permitida porque no es
 * dinero. Pasada la ventana, la corrección es una EnmiendaProcedimiento que
 * preserva el texto anterior.
 */

export const VENTANA_EDICION_NOTA_MS = 12 * 60 * 60 * 1000;

export function puedeEditarNotaDirecto(parametros: {
  creadoEn: Date;
  autorId: string;
  membresiaActualId: string;
  ahora?: Date;
}): boolean {
  const ahora = parametros.ahora ?? new Date();
  if (parametros.autorId !== parametros.membresiaActualId) return false;
  return ahora.getTime() - parametros.creadoEn.getTime() <= VENTANA_EDICION_NOTA_MS;
}
