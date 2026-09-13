/**
 * Selección de paciente en el formulario de nueva cita.
 *
 * **El problema que este archivo existe para impedir.** `listarPacientes` devuelve
 * los primeros 50 pacientes por orden alfabético (`src/server/db/pacientes.ts`),
 * pero la preselección que llega desde el expediente (`?pacienteId=`) se consulta
 * aparte y puede caer fuera de esos 50. Cuando eso pasaba, el `<select>` recibía
 * un `defaultValue` que no correspondía a ninguna `<option>`, y el navegador
 * resuelve ese caso **eligiendo la primera opción habilitada** — es decir, otro
 * paciente. El formulario se enviaba con un paciente válido de la clínica, así que
 * ni el esquema Zod ni la revalidación del servidor podían detectarlo: los dos ven
 * un id legítimo. La cita quedaba agendada a la persona equivocada, en silencio, y
 * la pantalla seguía diciendo "Paciente preseleccionado desde su expediente: X"
 * mientras el selector mostraba a Y.
 *
 * **La garantía.** `prepararSeleccionPaciente` devuelve las opciones y el valor a
 * seleccionar juntos, y el valor **siempre** corresponde a una opción presente. Si
 * no hay preselección utilizable, devuelve cadena vacía: con el `required` del
 * `<select>` eso obliga a una elección explícita. Nunca hay un tercer resultado.
 *
 * Es una función pura a propósito: el formulario es un Server Component y el
 * proyecto no tiene Testing Library (`docs/ARQUITECTURA.md` §17), así que la
 * lógica que puede equivocarse vive acá, donde una prueba unitaria la alcanza.
 */

/** Lo mínimo que necesita esta lógica. El DTO de paciente cumple de sobra. */
export type OpcionPaciente = { readonly id: string };

export type SeleccionPaciente<T extends OpcionPaciente> = {
  /** Las opciones que debe pintar el `<select>`, en este orden. */
  readonly opciones: readonly T[];
  /**
   * El `value` que debe quedar seleccionado. Cadena vacía significa "el usuario
   * tiene que elegir": nunca significa "elegí vos por él".
   */
  readonly valorSeleccionado: string;
};

/**
 * Une el listado con el paciente preseleccionado y decide qué queda seleccionado.
 *
 * - Sin preselección (o con una que el servidor no pudo resolver, porque el id era
 *   inválido o de otra clínica) → las opciones no cambian y no se selecciona nada.
 * - Con preselección ya presente en el listado → no se duplica.
 * - Con preselección ausente del listado → se agrega al final. El listado es un
 *   prefijo alfabético, así que un paciente que no está en él ordena después del
 *   último; agregarlo al final conserva el orden que ve recepción.
 */
export function prepararSeleccionPaciente<T extends OpcionPaciente>(
  pacientes: readonly T[],
  preseleccionado: T | null | undefined,
): SeleccionPaciente<T> {
  const id = preseleccionado?.id.trim() ?? "";
  if (id === "") return { opciones: pacientes, valorSeleccionado: "" };

  const yaEstaEnElListado = pacientes.some((paciente) => paciente.id === id);
  const opciones = yaEstaEnElListado ? pacientes : [...pacientes, preseleccionado!];

  // Candado final: el valor seleccionado solo se devuelve si de verdad existe entre
  // las opciones. Si alguien rompiera la unión de arriba, el formulario volvería a
  // exigir una elección explícita en vez de agendarle la cita a quien no era.
  const existe = opciones.some((paciente) => paciente.id === id);
  return { opciones, valorSeleccionado: existe ? id : "" };
}
