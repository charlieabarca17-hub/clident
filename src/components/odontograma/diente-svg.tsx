import type { Diente, Superficie } from "@/lib/dientes";
import type { CondicionDental } from "@/lib/odontograma";
import { colorCondicion, letraCondicion, textoSobreCondicion } from "@/lib/odontograma";

/**
 * La pieza dibujada: corona con sus cinco caras en posición anatómica, y raíz.
 *
 * **Por qué no es decoración.** Antes cada cara era un cuadradito en fila bajo
 * el número, y para saber cuál era mesial había que pasar el mouse. Un
 * odontólogo no lee odontogramas por tooltip: lee por posición. Este es el
 * esquema de siempre —cuatro caras alrededor de una central— dibujado sobre la
 * silueta de la pieza, que es lo que hay en el papel de cualquier clínica.
 *
 * **Dónde va cada cara, y por qué importa.**
 *
 * - **Mesial** apunta SIEMPRE hacia la línea media de la boca. En los cuadrantes
 *   1 y 4 —que se dibujan a la izquierda porque la derecha del paciente va a la
 *   izquierda de quien mira— eso es hacia la derecha; en los cuadrantes 2 y 3,
 *   hacia la izquierda. **Distal es el opuesto.** Fijarlas a un lado fijo
 *   dejaría media boca espejada, y un espejo en un odontograma es una cara
 *   tratada en el lado equivocado.
 * - **Vestibular** mira hacia afuera: arriba en la arcada superior, abajo en la
 *   inferior. **Palatina o lingual** ocupa el lado opuesto — cuál de las dos
 *   depende del cuadrante y ya viene resuelto en `Diente.superficies`.
 * - **Oclusal** (o **incisal** en los dientes de adelante) va al centro.
 *
 * **La raíz no es adorno tampoco:** distingue de un vistazo un molar de un
 * incisivo, y con eso la posición en el arco se lee sin contar piezas.
 *
 * Los colores y las letras salen de `lib/odontograma` sin tocarse: son
 * convención odontológica y marca no cromática para quien no distingue el
 * color. Una cara pintada siempre lleva su letra encima.
 */

/** Geometría del dibujo, en unidades del `viewBox`.
 *
 * La corona se lleva dos tercios del alto aunque en un diente real la raíz sea
 * más larga: acá la corona es donde vive el dato —las cinco caras— y la raíz
 * solo tiene que bastar para reconocer el tipo de pieza. Un dibujo anatómico
 * exacto dejaría la información en la parte más chica.
 *
 * **Nada se voltea con `scale`.** Voltear el SVG entero para la arcada superior
 * parece el atajo obvio y espeja también las caras: vestibular termina donde va
 * palatina, y media boca queda registrada del lado equivocado. Acá la raíz se
 * dibuja arriba o abajo según la arcada, y la corona siempre en su sitio.
 */
const ANCHO = 40;
const ALTO = 56;
const ALTO_RAIZ = 18;
const CORONA = ALTO - ALTO_RAIZ;

type CaraPintada = { superficie: Superficie; condicion: CondicionDental };

/**
 * Raíz, hacia afuera de la boca: arriba en el maxilar, abajo en la mandíbula.
 * `y0` es donde empieza (el borde de la corona) y `y1` la punta.
 */
function raiz(tipo: Diente["tipo"], y0: number, y1: number): string {
  const q = (x1: number, x2: number, x3: number) =>
    `M${x1} ${y0} Q${x2} ${y1} ${(x1 + x3) / 2} ${y1} Q${x2} ${y1} ${x3} ${y0} Z`;
  if (tipo === "MOLAR") {
    // Dos raíces separadas: la silueta que distingue un molar a simple vista.
    return `${q(8, 13, 18)} ${q(22, 27, 32)}`;
  }
  if (tipo === "PREMOLAR") return q(14, 20, 26);
  // Incisivo y canino: raíz única y afilada.
  return q(15, 20, 25);
}

/**
 * Qué cara va en cada lado del dibujo.
 *
 * Es la única parte de este archivo con criterio clínico, y la que se rompe en
 * silencio: un espejo acá pinta la caries en el lado equivocado de la boca y el
 * dibujo sigue viéndose bien. Por eso vive suelta y con prueba.
 *
 * - **Mesial** apunta a la línea media. Los cuadrantes 1 y 4 se dibujan a la
 *   izquierda del arco —la derecha del paciente va a la izquierda de quien
 *   mira—, así que su mesial cae a la derecha del dibujo. **Distal** es el
 *   opuesto.
 * - **Vestibular** mira hacia afuera: arriba en el maxilar, abajo en la
 *   mandíbula. La cara interna —**palatina** arriba, **lingual** abajo— ocupa el
 *   lado contrario.
 * - **Oclusal** (o **incisal** en los dientes de adelante) va al centro.
 */
export function zonasDeLaPieza(diente: Diente, arriba: boolean): {
  readonly arriba: Superficie;
  readonly abajo: Superficie;
  readonly izquierda: Superficie;
  readonly derecha: Superficie;
  readonly centro: Superficie;
} {
  const mesialALaDerecha =
    diente.cuadrante === 1 || diente.cuadrante === 4 || diente.cuadrante === 5 || diente.cuadrante === 8;
  const interna: Superficie = diente.superficies.includes("PALATINA") ? "PALATINA" : "LINGUAL";
  return {
    arriba: arriba ? "VESTIBULAR" : interna,
    abajo: arriba ? interna : "VESTIBULAR",
    izquierda: mesialALaDerecha ? "DISTAL" : "MESIAL",
    derecha: mesialALaDerecha ? "MESIAL" : "DISTAL",
    centro: diente.superficies.includes("INCISAL") ? "INCISAL" : "OCLUSAL",
  };
}

export function DienteDibujado({
  diente,
  arriba,
  completo,
  caras,
  hrefDeCara,
  caraSeleccionada,
  etiquetaDeCara,
}: {
  diente: Diente;
  arriba: boolean;
  completo: CondicionDental | null;
  caras: readonly CaraPintada[];
  /** Si viene, cada cara es un enlace: clic en la cara para trabajar ahí. */
  hrefDeCara?: (superficie: Superficie) => string;
  /** La cara que el usuario está mirando, para resaltarla. */
  caraSeleccionada?: Superficie | null;
  /** Qué dice el enlace en palabras, para quien no ve el dibujo. */
  etiquetaDeCara?: (superficie: Superficie) => string;
}) {
  const zonas = zonasDeLaPieza(diente, arriba);
  const caraCortante = zonas.centro;

  const porSuperficie = new Map(caras.map((c) => [c.superficie, c.condicion]));
  const condicionDe = (s: Superficie) => completo ?? porSuperficie.get(s) ?? null;
  const color = (s: Superficie) => {
    const c = condicionDe(s);
    return c ? colorCondicion(c) : "var(--card)";
  };
  const letra = (s: Superficie) => {
    const c = condicionDe(s);
    return c ? letraCondicion(c) : "";
  };
  const tinta = (s: Superficie) => {
    const c = condicionDe(s);
    return c ? textoSobreCondicion(c) : "var(--muted-foreground)";
  };

  // En el maxilar la corona va abajo (la raíz sube); en la mandíbula, arriba.
  const y = arriba ? ALTO_RAIZ : 0;
  const recorte = `corona-${diente.fdi}`;

  const trapecios: ReadonlyArray<{ s: Superficie; d: string; tx: number; ty: number }> = [
    { s: zonas.arriba, d: `M2 ${y} H38 L28 ${y + 10} H12 Z`, tx: 20, ty: y + 5 },
    { s: zonas.abajo, d: `M2 ${y + CORONA} H38 L28 ${y + CORONA - 10} H12 Z`, tx: 20, ty: y + CORONA - 5 },
    { s: zonas.izquierda, d: `M2 ${y} V${y + CORONA} L12 ${y + CORONA - 10} V${y + 10} Z`, tx: 7, ty: y + CORONA / 2 },
    { s: zonas.derecha, d: `M38 ${y} V${y + CORONA} L28 ${y + CORONA - 10} V${y + 10} Z`, tx: 33, ty: y + CORONA / 2 },
  ];

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="h-[54px] w-10 overflow-visible" aria-hidden="true">
      <defs>
        <clipPath id={recorte}>
          <rect x="2" y={y} width="36" height={CORONA} rx="9" ry="7" />
        </clipPath>
      </defs>

      {/* Raíz: el contorno que hace reconocible al tipo de pieza. */}
      <path
        d={arriba ? raiz(diente.tipo, ALTO_RAIZ, 1) : raiz(diente.tipo, CORONA, ALTO - 1)}
        fill={completo ? colorCondicion(completo) : "var(--muted)"}
        stroke="var(--foreground)"
        strokeOpacity="0.22"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Corona: las cuatro caras laterales y la cara cortante al centro. El
          recorte les da la silueta redondeada; sin él serían cinco polígonos
          con esquinas vivas. */}
      <g clipPath={`url(#${recorte})`}>
        {[
          ...trapecios,
          {
            s: caraCortante,
            rect: { x: 12, y: y + 10, w: 16, h: CORONA - 20 },
            tx: 20,
            ty: y + CORONA / 2,
          },
        ].map((zona) => {
          const superficie = zona.s;
          const forma = "rect" in zona ? (
            <rect
              x={zona.rect.x}
              y={zona.rect.y}
              width={zona.rect.w}
              height={zona.rect.h}
              rx="3"
              fill={color(superficie)}
              stroke={caraSeleccionada === superficie ? "var(--primary)" : "var(--border)"}
              strokeWidth={caraSeleccionada === superficie ? "2" : "0.8"}
            />
          ) : (
            <path
              d={zona.d}
              fill={color(superficie)}
              stroke={caraSeleccionada === superficie ? "var(--primary)" : "var(--border)"}
              strokeWidth={caraSeleccionada === superficie ? "2" : "0.8"}
              strokeLinejoin="round"
            />
          );
          const contenido = (
            <>
              {forma}
              {letra(superficie) ? (
                <text
                  x={zona.tx}
                  y={zona.ty}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={"rect" in zona ? "8" : "7"}
                  fontWeight="700"
                  fill={tinta(superficie)}
                  pointerEvents="none"
                >
                  {letra(superficie)}
                </text>
              ) : null}
            </>
          );
          if (!hrefDeCara) return <g key={superficie}>{contenido}</g>;
          return (
            <a
              key={superficie}
              href={hrefDeCara(superficie)}
              aria-label={etiquetaDeCara?.(superficie)}
              className="cursor-pointer outline-none [&>path]:transition-opacity [&>rect]:transition-opacity hover:[&>path]:opacity-70 hover:[&>rect]:opacity-70 focus-visible:[&>path]:stroke-[2.5] focus-visible:[&>rect]:stroke-[2.5]"
            >
              {contenido}
            </a>
          );
        })}
      </g>

      {/* El contorno va al final, sobre las caras: es la línea que hace que el
          conjunto se lea como una pieza y no como cinco recortes. */}
      <rect x="2" y={y} width="36" height={CORONA} rx="9" ry="7" fill="none" stroke="var(--foreground)" strokeOpacity="0.3" strokeWidth="1.2" />
    </svg>
  );
}
