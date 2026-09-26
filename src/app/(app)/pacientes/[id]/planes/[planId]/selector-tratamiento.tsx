"use client";

import { useState } from "react";

import { usdEditable } from "@/lib/money";
import { esPorDebajoDelHabitual, precioAlElegirTratamiento } from "@/lib/precarga-precio";

/**
 * El selector de tratamiento y el precio, juntos.
 *
 * **Por qué es un componente de cliente.** El precio habitual depende de qué
 * tratamiento se elija, y eso pasa sin recargar la página. Es el único lugar del
 * formulario que necesita reaccionar en el navegador; todo lo demás sigue siendo
 * HTML normal que se envía a una Server Action.
 *
 * **Qué hace y qué no.** Al elegir un tratamiento, pone en el campo el precio
 * habitual de la clínica (ADR-020) **si el campo no se tocó a mano**. Si el
 * odontólogo ya escribió un número, no se lo pisa: lo que él escribe manda
 * siempre (ADR-017). El precio que se guarda es el del campo, no el del
 * catálogo — el servidor vuelve a leer el habitual por su cuenta para el
 * snapshot, así que nada de lo que viaje desde acá puede falsear cuánto se dio
 * en tarifa preferencial.
 */
export type OpcionTratamiento = {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly categoria: string;
  readonly precioHabitualCentavos: number | null;
};

export function SelectorTratamientoYPrecio({ opciones }: { opciones: readonly OpcionTratamiento[] }) {
  const [precio, setPrecio] = useState("");
  const [tocado, setTocado] = useState(false);
  const [elegido, setElegido] = useState<OpcionTratamiento | null>(null);

  const categorias = [...new Set(opciones.map((o) => o.categoria))];

  return (
    <>
      <label className="block text-sm font-medium">Tratamiento *
        <select
          name="tratamientoId"
          required
          className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
          onChange={(evento) => {
            const opcion = opciones.find((o) => o.id === evento.target.value) ?? null;
            setElegido(opcion);
            setPrecio(precioAlElegirTratamiento(precio, tocado, opcion?.precioHabitualCentavos));
          }}
        >
          <option value="">— Elegí del catálogo —</option>
          {categorias.map((categoria) => (
            <optgroup key={categoria} label={categoria}>
              {opciones.filter((o) => o.categoria === categoria).map((opcion) => (
                <option key={opcion.id} value={opcion.id}>
                  {opcion.codigo} · {opcion.nombre}
                  {opcion.precioHabitualCentavos != null ? ` — $${usdEditable(opcion.precioHabitualCentavos)}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">Precio para este paciente (USD) *
        <input
          name="precioAcordado"
          required
          inputMode="decimal"
          placeholder="150.00"
          value={precio}
          onChange={(evento) => {
            setPrecio(evento.target.value);
            setTocado(true);
          }}
          className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
        />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          Es el precio total del tratamiento, aunque necesite varias sesiones.
          {elegido?.precioHabitualCentavos != null ? (
            <>
              {" "}Habitual de la clínica: ${usdEditable(elegido.precioHabitualCentavos)}.
              {esPorDebajoDelHabitual(precio, elegido.precioHabitualCentavos)
                ? " Por debajo de lo habitual: la diferencia queda registrada como tarifa preferencial."
                : ""}
            </>
          ) : elegido ? (
            " Este tratamiento todavía no tiene precio habitual en el catálogo."
          ) : null}
        </span>
      </label>
    </>
  );
}
