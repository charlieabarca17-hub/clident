export const SUPERFICIES = [
  "COMPLETO",
  "MESIAL",
  "DISTAL",
  "VESTIBULAR",
  "PALATINA",
  "LINGUAL",
  "INCISAL",
  "OCLUSAL",
] as const;

export type Superficie = (typeof SUPERFICIES)[number];
export type Denticion = "PERMANENTE" | "TEMPORAL";
export type TipoDiente = "INCISIVO" | "CANINO" | "PREMOLAR" | "MOLAR";

export type Diente = Readonly<{
  fdi: number;
  denticion: Denticion;
  tipo: TipoDiente;
  cuadrante: number;
  posicion: number;
  nombre: string;
  superficies: readonly Superficie[];
}>;

function tipoDeDiente(denticion: Denticion, posicion: number): TipoDiente {
  if (posicion <= 2) return "INCISIVO";
  if (posicion === 3) return "CANINO";
  if (denticion === "PERMANENTE" && posicion <= 5) return "PREMOLAR";
  return "MOLAR";
}

function superficiesDeDiente(cuadrante: number, posicion: number): readonly Superficie[] {
  const caraInterna = cuadrante === 1 || cuadrante === 2 || cuadrante === 5 || cuadrante === 6
    ? "PALATINA"
    : "LINGUAL";
  const caraCortante = posicion <= 3 ? "INCISAL" : "OCLUSAL";
  return ["COMPLETO", "MESIAL", "DISTAL", "VESTIBULAR", caraInterna, caraCortante];
}

function crearDenticion(
  cuadrantes: readonly number[],
  posiciones: readonly number[],
  denticion: Denticion,
): Diente[] {
  return cuadrantes.flatMap((cuadrante) =>
    posiciones.map((posicion) => {
      const tipo = tipoDeDiente(denticion, posicion);
      return {
        fdi: cuadrante * 10 + posicion,
        denticion,
        tipo,
        cuadrante,
        posicion,
        nombre: `${tipo.charAt(0)}${tipo.slice(1).toLowerCase()} ${cuadrante * 10 + posicion}`,
        superficies: superficiesDeDiente(cuadrante, posicion),
      };
    }),
  );
}

export const DIENTES: readonly Diente[] = [
  ...crearDenticion([1, 2, 3, 4], [1, 2, 3, 4, 5, 6, 7, 8], "PERMANENTE"),
  ...crearDenticion([5, 6, 7, 8], [1, 2, 3, 4, 5], "TEMPORAL"),
];

export function buscarDiente(fdi: number): Diente | undefined {
  return DIENTES.find((diente) => diente.fdi === fdi);
}

/**
 * La pieza y la cara que vienen en la URL del odontograma, ya validadas.
 *
 * El clic en una cara viaja por la barra de direcciones —así el enlace se
 * comparte y el botón de atrás funciona— y eso la vuelve **entrada de usuario**:
 * cualquiera puede escribir `?fdi=11&cara=OCLUSAL`. Un incisivo no tiene cara
 * oclusal, y pintar una cara que esa pieza no tiene es un dibujo que miente.
 *
 * Devuelve `null` ante cualquier cosa que no sea una pieza real con una cara que
 * esa pieza efectivamente tiene. No lanza: una URL mal escrita muestra el
 * odontograma sin selección, no un error.
 */
export function seleccionDeCara(
  fdi: unknown,
  cara: unknown,
): { readonly fdi: number; readonly superficie: Superficie } | null {
  if (typeof fdi !== "string" || typeof cara !== "string") return null;
  // Number("") es 0 y Number(" 26 ") es 26: ninguno de los dos debe pasar.
  if (!/^\d{2}$/.test(fdi)) return null;
  const diente = buscarDiente(Number(fdi));
  if (!diente) return null;
  if (!(diente.superficies as readonly string[]).includes(cara)) return null;
  return { fdi: diente.fdi, superficie: cara as Superficie };
}
