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
//
// LOS COLORES NO SE CAMBIAN por armonía visual con la paleta de la marca.
// Siguen convención odontológica (rojo = caries, azul = obturación) y un
// odontólogo los lee sin leyenda. Recolorearlos es una decisión clínica, no
// de diseño.
//
// `letra` es la marca no cromática de cada condición. Alrededor del 8% de los
// hombres tiene daltonismo, y esto es una historia clínica: el color NUNCA
// puede ser el único portador de sentido. Cada letra es única entre las 16 —
// si dos condiciones compartieran letra, la marca dejaría de distinguirlas
// justo para quien no puede usar el color.
export const CONDICIONES_DENTALES = [
  { condicion: "SANO", etiqueta: "Sano", color: "#4CAF50", letra: "·" },
  { condicion: "CARIES", etiqueta: "Caries", color: "#E53935", letra: "C" },
  { condicion: "OBTURACION", etiqueta: "Obturación", color: "#1E88E5", letra: "O" },
  // K de corona: "C" ya la ocupa caries, y K es la convención heredada del alemán.
  { condicion: "CORONA", etiqueta: "Corona", color: "#F59E0B", letra: "K" },
  { condicion: "IMPLANTE", etiqueta: "Implante", color: "#7C3AED", letra: "I" },
  { condicion: "EXTRACCION_INDICADA", etiqueta: "Extracción indicada", color: "#6D4C41", letra: "▲" },
  { condicion: "AUSENTE", etiqueta: "Ausente", color: "#9E9E9E", letra: "✕" },
  { condicion: "ENDODONCIA", etiqueta: "Endodoncia", color: "#E91E63", letra: "E" },
  { condicion: "PUENTE", etiqueta: "Puente", color: "#FF7043", letra: "P" },
  // R de p-r-ótesis: "P" ya la ocupa puente.
  { condicion: "PROTESIS", etiqueta: "Prótesis", color: "#00ACC1", letra: "R" },
  { condicion: "SELLANTE", etiqueta: "Sellante", color: "#43A047", letra: "S" },
  { condicion: "FRACTURA", etiqueta: "Fractura", color: "#FF5722", letra: "F" },
  { condicion: "MOVILIDAD", etiqueta: "Movilidad", color: "#FDD835", letra: "M" },
  // G de recesión -g-ingival, que es como se llama completa en la leyenda.
  { condicion: "RECESION", etiqueta: "Recesión gingival", color: "#D81B60", letra: "G" },
  { condicion: "ABSCESO", etiqueta: "Absceso", color: "#8D6E63", letra: "A" },
  // D de impacta-d-o: "I" ya la ocupa implante.
  { condicion: "IMPACTADO", etiqueta: "Impactado", color: "#5E35B1", letra: "D" },
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

/** Marca no cromática de la condición: lo que se lee cuando el color no llega. */
export function letraCondicion(condicion: CondicionDental): string {
  return POR_CONDICION.get(condicion)?.letra ?? "?";
}

/**
 * Elige negro o blanco para el texto sobre el color de una condición, según
 * cuál de los dos contrasta más.
 *
 * Los 16 colores son de convención odontológica y cubren todo el rango de
 * luminosidad: el amarillo de movilidad (#FDD835) con letra blanca da 1.4:1 y
 * es ilegible, y el café de absceso (#8D6E63) con letra negra queda flojo.
 * Fijar un solo color de texto rompe la mitad de los casos, así que se calcula.
 */
export function textoSobreCondicion(condicion: CondicionDental): string {
  const hex = colorCondicion(condicion);
  const canal = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const luminancia = 0.2126 * canal[0] + 0.7152 * canal[1] + 0.0722 * canal[2];
  // Contraste contra blanco vs. contra negro; gana el mayor.
  const contraBlanco = 1.05 / (luminancia + 0.05);
  const contraNegro = (luminancia + 0.05) / 0.05;
  return contraNegro > contraBlanco ? "#1a1a1a" : "#ffffff";
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
