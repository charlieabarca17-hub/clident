import { DienteDibujado } from "@/components/odontograma/diente-svg";
import { DIENTES, type Diente, type Superficie } from "@/lib/dientes";
import { etiquetaCondicion } from "@/lib/odontograma";
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
  hrefDeCara,
  seleccion,
}: {
  diente: Diente;
  estados: Map<string, EstadoSuperficieDto>;
  indice: number;
  total: number;
  arriba: boolean;
  hrefDeCara?: (fdi: number, superficie: Superficie) => string;
  seleccion?: { fdi: number; superficie: Superficie } | null;
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
      {/* La pieza dibujada: corona con sus cinco caras en posición anatómica y
          raíz según el tipo. Antes las caras eran cuadraditos en fila y solo se
          sabía cuál era mesial pasando el mouse; un odontólogo lee la posición,
          no el tooltip. */}
      <span title={etiquetaAccesible}>
        <DienteDibujado
          diente={diente}
          arriba={arriba}
          completo={completo ? completo.condicion : null}
          caras={caras.map((c) => ({ superficie: c.superficie, condicion: c.estado!.condicion }))}
          hrefDeCara={hrefDeCara ? (superficie) => hrefDeCara(diente.fdi, superficie) : undefined}
          caraSeleccionada={seleccion?.fdi === diente.fdi ? seleccion.superficie : null}
          etiquetaDeCara={(superficie) => {
            const estado = estados.get(`${diente.fdi}:${superficie}`);
            const actual = estado ? etiquetaCondicion(estado.condicion) : "sin registro";
            return `Pieza ${diente.fdi}, cara ${superficie.toLowerCase()}: ${actual}. Trabajar acá.`;
          }}
        />
      </span>

      <span className="font-mono text-[11px] leading-none text-muted-foreground" aria-hidden="true">
        {diente.fdi}
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
  hrefDeCara,
  seleccion,
}: {
  dientes: Diente[];
  estados: Map<string, EstadoSuperficieDto>;
  arriba: boolean;
  etiqueta: string;
  /** Con esto cada cara se vuelve un enlace y el odontograma deja de ser solo lectura. */
  hrefDeCara?: (fdi: number, superficie: Superficie) => string;
  seleccion?: { fdi: number; superficie: Superficie } | null;
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
          hrefDeCara={hrefDeCara}
          seleccion={seleccion}
        />
      ))}
    </ul>
  );
}
