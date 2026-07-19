import { DIENTES, type Diente } from "@/lib/dientes";
import {
  colorCondicion,
  etiquetaCondicion,
  letraCondicion,
  textoSobreCondicion,
} from "@/lib/odontograma";
import type { EstadoSuperficieDto } from "@/server/dto/odontograma";

/**
 * Odontograma en arco anatómico.
 *
 * Es la apuesta de identidad de CLIDENT: la anatomía vive en la ESTRUCTURA de
 * la interfaz, no en ilustraciones pegadas encima. Dos filas rectas de dientes
 * son más fáciles de programar y no se parecen a una boca; el arco sí, y es lo
 * que un odontólogo reconoce sin que nadie se lo explique.
 *
 * Cómo se dibuja la curva: cada pieza se corre verticalmente según una
 * parábola sobre su posición en la fila (`desplazamiento = amplitud · t²`) y se
 * inclina según la pendiente de esa parábola (`giro ∝ t`). Se hace con
 * `transform` sobre un flex normal y NO con posicionamiento absoluto ni
 * trigonometría: el flujo del documento sigue siendo el de una fila corriente,
 * así que el orden de lectura, el foco del teclado y el ajuste a pantallas
 * angostas siguen funcionando solos.
 *
 * Las dos arcadas se ENFRENTAN, como en cualquier odontograma clínico: la
 * superior abre hacia abajo (∪) y la inferior hacia arriba (∩), de modo que los
 * incisivos de ambas quedan juntos en el centro y los molares se van a las
 * esquinas. Es la vista oclusal de las dos herraduras, que es lo que un
 * odontólogo espera ver. (Curvarlas al revés las hace divergir en el centro:
 * se ve simétrico y elegante, y está mal.)
 *
 * El cuadrante 1 va arriba a la izquierda, que es la convención odontológica:
 * la derecha del paciente queda a la izquierda de quien mira.
 */

/** Cuánto se separa del centro la pieza más lateral, en píxeles. */
const AMPLITUD = 34;
/** Inclinación de la pieza más lateral, en grados. */
const GIRO_MAXIMO = 20;

/** Orden visual de una arcada: cuadrante derecho de atrás hacia el centro y luego el izquierdo. */
export function arcada(cuadranteDerecho: number, cuadranteIzquierdo: number): Diente[] {
  const derecho = DIENTES.filter((d) => d.cuadrante === cuadranteDerecho).sort(
    (a, b) => b.posicion - a.posicion,
  );
  const izquierdo = DIENTES.filter((d) => d.cuadrante === cuadranteIzquierdo).sort(
    (a, b) => a.posicion - b.posicion,
  );
  return [...derecho, ...izquierdo];
}

function DienteCelda({
  diente,
  estados,
  indice,
  total,
  arriba,
}: {
  diente: Diente;
  estados: Map<string, EstadoSuperficieDto>;
  indice: number;
  total: number;
  arriba: boolean;
}) {
  const completo = estados.get(`${diente.fdi}:COMPLETO`);
  const caras = diente.superficies
    .filter((s) => s !== "COMPLETO")
    .map((s) => ({ superficie: s, estado: estados.get(`${diente.fdi}:${s}`) }))
    .filter((c) => c.estado);

  // Posición normalizada dentro de la fila: −1 en el extremo derecho del
  // paciente, 0 en el centro (entre los incisivos), +1 en el otro extremo.
  const centro = (total - 1) / 2;
  const t = centro === 0 ? 0 : (indice - centro) / centro;
  // Arcada superior: los extremos SUBEN (los molares se van a las esquinas de
  // arriba) y el centro queda abajo, contra la arcada inferior. La inferior es
  // el espejo. `translateY` positivo baja, de ahí los signos.
  const signo = arriba ? -1 : 1;
  const desplazamiento = signo * AMPLITUD * t * t;
  const giro = signo * GIRO_MAXIMO * t;

  const descripcion = [
    completo ? `${etiquetaCondicion(completo.condicion)}, pieza completa` : null,
    ...caras.map((c) => `${etiquetaCondicion(c.estado!.condicion)} en ${c.superficie.toLowerCase()}`),
  ].filter(Boolean);

  // El título del navegador y la etiqueta accesible dicen lo MISMO. Un lector
  // de pantalla no puede ver el color ni la letra: acá es donde recibe el
  // estado clínico completo en palabras.
  const resumen = descripcion.length > 0 ? descripcion.join(" · ") : "sin registros";
  const etiquetaAccesible = `Pieza ${diente.fdi}, ${diente.nombre}: ${resumen}`;

  return (
    <li
      className="flex w-11 shrink-0 flex-col items-center gap-1"
      style={{ transform: `translateY(${desplazamiento}px) rotate(${giro}deg)` }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-bold shadow-sm"
        style={
          completo
            ? {
                backgroundColor: colorCondicion(completo.condicion),
                color: textoSobreCondicion(completo.condicion),
                borderColor: "transparent",
              }
            : {
                backgroundColor: "var(--card)",
                color: "var(--muted-foreground)",
                borderColor: "var(--border)",
              }
        }
        aria-hidden="true"
        title={etiquetaAccesible}
      >
        {completo ? letraCondicion(completo.condicion) : ""}
      </span>

      <span className="font-mono text-[11px] leading-none text-muted-foreground" aria-hidden="true">
        {diente.fdi}
      </span>

      {/* Marcas de cara. Cada una lleva su color y su letra, igual que la pieza
          completa: una cara con caries se lee "C" aunque el rojo no se vea. */}
      <span className="flex h-3 items-center gap-0.5" aria-hidden="true">
        {caras.map((cara) => (
          <span
            key={cara.superficie}
            className="flex h-3 w-3 items-center justify-center rounded-[4px] text-[8px] font-bold leading-none"
            style={{
              backgroundColor: colorCondicion(cara.estado!.condicion),
              color: textoSobreCondicion(cara.estado!.condicion),
            }}
            title={`${cara.superficie.toLowerCase()}: ${etiquetaCondicion(cara.estado!.condicion)}`}
          >
            {letraCondicion(cara.estado!.condicion)}
          </span>
        ))}
      </span>

      {/* Todo lo de arriba es `aria-hidden` porque es una traducción visual del
          mismo dato. Esta línea es la que se lee, una sola vez y en español. */}
      <span className="sr-only">{etiquetaAccesible}</span>
    </li>
  );
}

export function Arcada({
  dientes,
  estados,
  arriba,
  etiqueta,
}: {
  dientes: Diente[];
  estados: Map<string, EstadoSuperficieDto>;
  arriba: boolean;
  etiqueta: string;
}) {
  return (
    <ul
      aria-label={etiqueta}
      className="flex min-w-max justify-center gap-0.5"
      // El desplazamiento vertical sale del flujo normal: sin este espacio, las
      // piezas laterales se montarían sobre la arcada vecina.
      style={{ paddingBlock: `${AMPLITUD + 6}px` }}
    >
      {dientes.map((diente, indice) => (
        <DienteCelda
          key={diente.fdi}
          diente={diente}
          estados={estados}
          indice={indice}
          total={dientes.length}
          arriba={arriba}
        />
      ))}
    </ul>
  );
}
