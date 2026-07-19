/**
 * Odontograma: catálogo de condiciones y reducer de la historia (ADR-005).
 *
 * La fuente de verdad es el log append-only de eventos; la proyección
 * (`estados_superficie`) es derivada y regenerable. Este archivo contiene la
 * ÚNICA implementación del pliegue ("¿qué evento gana?"): la usan el camino de
 * anulación, el rebuild y las pruebas de equivalencia. Si el criterio de
 * desempate viviera en dos lugares, los dos caminos podrían divergir en
 * silencio — exactamente el bug que la prueba de equivalencia existe para atrapar.
 */

// Las 16 condiciones y sus colores vienen del prototipo validado (referencia
// de producto). El color es presentación; el valor clínico es el enum.
export const CONDICIONES_DENTALES = [
  { condicion: "SANO", etiqueta: "Sano", color: "#4CAF50" },
  { condicion: "CARIES", etiqueta: "Caries", color: "#E53935" },
  { condicion: "OBTURACION", etiqueta: "Obturación", color: "#1E88E5" },
  { condicion: "CORONA", etiqueta: "Corona", color: "#F59E0B" },
  { condicion: "IMPLANTE", etiqueta: "Implante", color: "#7C3AED" },
  { condicion: "EXTRACCION_INDICADA", etiqueta: "Extracción indicada", color: "#6D4C41" },
  { condicion: "AUSENTE", etiqueta: "Ausente", color: "#9E9E9E" },
  { condicion: "ENDODONCIA", etiqueta: "Endodoncia", color: "#E91E63" },
  { condicion: "PUENTE", etiqueta: "Puente", color: "#FF7043" },
  { condicion: "PROTESIS", etiqueta: "Prótesis", color: "#00ACC1" },
  { condicion: "SELLANTE", etiqueta: "Sellante", color: "#43A047" },
  { condicion: "FRACTURA", etiqueta: "Fractura", color: "#FF5722" },
  { condicion: "MOVILIDAD", etiqueta: "Movilidad", color: "#FDD835" },
  { condicion: "RECESION", etiqueta: "Recesión gingival", color: "#D81B60" },
  { condicion: "ABSCESO", etiqueta: "Absceso", color: "#8D6E63" },
  { condicion: "IMPACTADO", etiqueta: "Impactado", color: "#5E35B1" },
] as const;

export type CondicionDental = (typeof CONDICIONES_DENTALES)[number]["condicion"];

// Tupla no vacía para que z.enum() conserve el tipo literal de cada condición.
export const CONDICIONES = CONDICIONES_DENTALES.map(
  (entrada) => entrada.condicion,
) as [CondicionDental, ...CondicionDental[]];

const POR_CONDICION = new Map(CONDICIONES_DENTALES.map((entrada) => [entrada.condicion, entrada]));

export function etiquetaCondicion(condicion: CondicionDental): string {
  return POR_CONDICION.get(condicion)?.etiqueta ?? condicion;
}

export function colorCondicion(condicion: CondicionDental): string {
  return POR_CONDICION.get(condicion)?.color ?? "#cccccc";
}

export type TipoEventoOdontograma =
  | "CONDICION_REGISTRADA"
  | "TRATAMIENTO_INDICADO"
  | "PROCEDIMIENTO_REALIZADO"
  | "CONDICION_ANULADA";

export type EventoOdontogramaReducible = Readonly<{
  id: string;
  tipo: TipoEventoOdontograma;
  condicion: CondicionDental | null;
  ocurridoEn: Date;
  creadoEn: Date;
  anulaEventoId: string | null;
}>;

export type EstadoSuperficieReducido = Readonly<{
  condicion: CondicionDental;
  tratamientoPendiente: boolean;
  ultimoEventoId: string;
  ultimoEventoEn: Date;
  ultimoEventoCreadoEn: Date;
}>;

/**
 * Compara por la tupla (ocurridoEn, creadoEn) — el ÚNICO criterio de desempate
 * del sistema. El UPDATE condicional del camino en vivo compara exactamente la
 * misma tupla; con un solo campo los dos caminos divergirían con eventos del
 * mismo instante clínico.
 */
function esPosterior(a: EventoOdontogramaReducible, b: EventoOdontogramaReducible): boolean {
  const porOcurrido = a.ocurridoEn.getTime() - b.ocurridoEn.getTime();
  if (porOcurrido !== 0) return porOcurrido > 0;
  return a.creadoEn.getTime() > b.creadoEn.getTime();
}

/**
 * Pliega la historia completa de UNA superficie: gana el último evento no
 * anulado por (ocurridoEn, creadoEn). Devuelve `null` si ningún evento vigente
 * aporta estado (todo se anuló): la proyección debe borrar esa fila.
 *
 * El switch NO tiene default a propósito: un tipo de evento nuevo sin su rama
 * es un error de compilación, no un estado silenciosamente mal proyectado.
 */
export function reducirHistoriaSuperficie(
  eventos: readonly EventoOdontogramaReducible[],
): EstadoSuperficieReducido | null {
  const anulados = new Set<string>();
  for (const evento of eventos) {
    if (evento.tipo === "CONDICION_ANULADA" && evento.anulaEventoId) {
      anulados.add(evento.anulaEventoId);
    }
  }

  let ganador: EventoOdontogramaReducible | null = null;
  let pendienteDelGanador = false;

  for (const evento of eventos) {
    if (anulados.has(evento.id)) continue;

    let aporta: { pendiente: boolean } | null;
    switch (evento.tipo) {
      case "CONDICION_REGISTRADA":
        aporta = { pendiente: false };
        break;
      case "TRATAMIENTO_INDICADO":
        aporta = { pendiente: true };
        break;
      case "PROCEDIMIENTO_REALIZADO":
        aporta = { pendiente: false };
        break;
      case "CONDICION_ANULADA":
        // La anulación no aporta estado propio: el estado correcto sale del
        // último evento no anulado ANTERIOR, que este bucle encuentra solo.
        aporta = null;
        break;
    }
    if (aporta === null || evento.condicion === null) continue;

    if (ganador === null || esPosterior(evento, ganador)) {
      ganador = evento;
      pendienteDelGanador = aporta.pendiente;
    }
  }

  if (ganador === null || ganador.condicion === null) return null;
  return {
    condicion: ganador.condicion,
    tratamientoPendiente: pendienteDelGanador,
    ultimoEventoId: ganador.id,
    ultimoEventoEn: ganador.ocurridoEn,
    ultimoEventoCreadoEn: ganador.creadoEn,
  };
}
