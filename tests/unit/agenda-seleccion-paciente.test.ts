import { describe, expect, it } from "vitest";

import { prepararSeleccionPaciente } from "@/lib/agenda";

// Regresión del Ciclo 17. El formulario de nueva cita pintaba solo los primeros 50
// pacientes (`listarPacientes` usa `take: 50`) pero recibía la preselección desde
// el expediente por separado. Cuando el preseleccionado caía fuera de esos 50, el
// `<select>` quedaba con un `defaultValue` sin `<option>` correspondiente y el
// navegador seleccionaba la primera opción habilitada: otro paciente.
//
// Por qué ni Zod ni el servidor lo atrapaban: el id enviado era el de un paciente
// real de la misma clínica. La revalidación de `citas.ts` confirma que pertenece a
// `ctx.clinicaId` y da el visto bueno. El servidor no puede saber a quién pretendía
// elegir el usuario — por eso la garantía tiene que estar acá.

/** Paciente de prueba con la forma mínima que la función necesita. */
function paciente(id: string) {
  return { id, nombres: "Ana", apellidos: `Apellido${id}`, telefono: "7000-0000" } as const;
}

const listadoDe50 = Array.from({ length: 50 }, (_, i) => paciente(`p${i + 1}`));

describe("prepararSeleccionPaciente", () => {
  it("paciente preseleccionado DENTRO de los 50: queda seleccionado y no se duplica", () => {
    const dentro = listadoDe50[7];

    const { opciones, valorSeleccionado } = prepararSeleccionPaciente(listadoDe50, dentro);

    expect(valorSeleccionado).toBe(dentro.id);
    expect(opciones).toHaveLength(50);
    expect(opciones.filter((p) => p.id === dentro.id)).toHaveLength(1);
  });

  it("paciente preseleccionado FUERA de los 50: se agrega al selector y queda seleccionado", () => {
    // Éste es el caso que agendaba la cita a otra persona.
    const fuera = paciente("p999");

    const { opciones, valorSeleccionado } = prepararSeleccionPaciente(listadoDe50, fuera);

    expect(valorSeleccionado).toBe(fuera.id);
    expect(opciones).toHaveLength(51);
    expect(opciones.some((p) => p.id === fuera.id)).toBe(true);
    // Y sobre todo: el valor seleccionado NO es el primer paciente del listado.
    expect(valorSeleccionado).not.toBe(listadoDe50[0].id);
  });

  it("sin preselección: no elige a nadie y obliga a una elección explícita", () => {
    const { opciones, valorSeleccionado } = prepararSeleccionPaciente(listadoDe50, null);

    // Cadena vacía + el `required` del <select> = el formulario no se envía solo.
    expect(valorSeleccionado).toBe("");
    expect(opciones).toHaveLength(50);
  });

  it("id inválido o de otra clínica: el servidor devuelve null y tampoco se elige a nadie", () => {
    // `getPacienteParaAgenda` filtra por `clinicaId` y devuelve null tanto para un id
    // inexistente como para uno de otra clínica (cross-tenant se ve igual que
    // inexistente, CLAUDE.md §2.6). La página recibe null en los dos casos.
    for (const preseleccionIrresoluble of [null, undefined]) {
      const { opciones, valorSeleccionado } = prepararSeleccionPaciente(
        listadoDe50,
        preseleccionIrresoluble,
      );

      expect(valorSeleccionado).toBe("");
      expect(opciones).toHaveLength(50);
    }
  });

  it("una preselección con id vacío o en blanco se trata como ausente", () => {
    expect(prepararSeleccionPaciente(listadoDe50, paciente("")).valorSeleccionado).toBe("");
    expect(prepararSeleccionPaciente(listadoDe50, paciente("   ")).valorSeleccionado).toBe("");
  });

  it("INVARIANTE: el valor seleccionado siempre existe entre las opciones, o es vacío", () => {
    const casos = [
      prepararSeleccionPaciente(listadoDe50, listadoDe50[3]),
      prepararSeleccionPaciente(listadoDe50, paciente("p999")),
      prepararSeleccionPaciente(listadoDe50, null),
      prepararSeleccionPaciente([], paciente("p1")),
      prepararSeleccionPaciente([], null),
    ];

    for (const { opciones, valorSeleccionado } of casos) {
      if (valorSeleccionado === "") continue;
      expect(opciones.some((p) => p.id === valorSeleccionado)).toBe(true);
    }
  });

  it("no muta el listado que recibe", () => {
    const original = [...listadoDe50];

    prepararSeleccionPaciente(listadoDe50, paciente("p999"));

    expect(listadoDe50).toEqual(original);
    expect(listadoDe50).toHaveLength(50);
  });

  it("listado vacío con preselección válida: el paciente igual aparece y queda elegible", () => {
    const unico = paciente("p1");

    const { opciones, valorSeleccionado } = prepararSeleccionPaciente([], unico);

    expect(opciones).toHaveLength(1);
    expect(valorSeleccionado).toBe(unico.id);
  });
});
