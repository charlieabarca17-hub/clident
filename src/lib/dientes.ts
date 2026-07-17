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
