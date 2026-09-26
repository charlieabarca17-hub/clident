"use client";

import { useActionState } from "react";

import { DIENTES, SUPERFICIES } from "@/lib/dientes";
import { CONDICIONES_DENTALES } from "@/lib/odontograma";
import { avisoDeFormulario, ESTADO_INICIAL } from "@/lib/formulario";
import { realizarProcedimientoDesdeFormulario } from "@/server/actions/procedimientos";

/**
 * Componente de cliente por `useActionState`: es lo que permite devolver el error
 * junto con lo ya escrito. Acá importa más que en ningún otro formulario, porque
 * la nota clínica es lo más caro de volver a escribir y viaja en el cuerpo de la
 * respuesta, nunca en la URL.
 */
export function FormularioProcedimiento({
  pacienteId,
  filasDientes,
  itemsRealizables,
}: {
  pacienteId: string;
  filasDientes: number;
  itemsRealizables: ReadonlyArray<{
    id: string;
    tratamientoNombre: string;
    planTitulo: string;
    estado: string;
  }>;
}) {
  const [estado, accion, pendiente] = useActionState(
    realizarProcedimientoDesdeFormulario,
    ESTADO_INICIAL,
  );
  const escrito = estado.valores;

  return (
    <form action={accion} className="mt-4 space-y-4">
      {estado.mensajes.length > 0 ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <p className="font-medium">{avisoDeFormulario(estado.estado, "el procedimiento").titulo}</p>
          <ul className="mt-1 list-disc pl-5">
            {estado.mensajes.map((mensaje) => <li key={mensaje}>{mensaje}</li>)}
          </ul>
          <p className="mt-2 text-xs">{avisoDeFormulario(estado.estado, "el procedimiento").pie}</p>
        </div>
      ) : null}

      <input type="hidden" name="pacienteId" value={pacienteId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium sm:col-span-2">Tratamiento del plan *
          <select name="planItemId" required defaultValue={escrito.planItemId ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
            <option value="">— Elegí el tratamiento aceptado —</option>
            {itemsRealizables.map((item) => (
              <option key={item.id} value={item.id}>
                {item.tratamientoNombre} · {item.planTitulo} ({item.estado === "EN_PROCESO" ? "en proceso" : "aceptado"})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">Fecha y hora
          <input name="realizadoEn" type="datetime-local" defaultValue={escrito.realizadoEn ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Vacío = ahora.</span>
        </label>
        <label className="block text-sm font-medium">La pieza queda como
          <select name="condicionResultante" defaultValue={escrito.condicionResultante ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
            <option value="">— Sin cambio en el odontograma —</option>
            {CONDICIONES_DENTALES.map((entrada) => (
              <option key={entrada.condicion} value={entrada.condicion}>{entrada.etiqueta}</option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Obligatorio si indicás piezas: pinta el odontograma.</span>
        </label>
        <label className="block text-sm font-medium sm:col-span-2">Nota clínica
          <textarea name="notasClinicas" maxLength={5000} rows={3} defaultValue={escrito.notasClinicas ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Editable por vos durante 12 horas; después, solo por enmienda que preserva el texto original.
          </span>
        </label>
      </div>

      <fieldset className="rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Piezas tratadas</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: filasDientes }, (_, fila) => (
            <div key={fila} className="flex gap-2">
              <select name={`diente-${fila}`} defaultValue={escrito[`diente-${fila}`] ?? ""} className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm" aria-label={`Pieza ${fila + 1}`}>
                <option value="">— Pieza —</option>
                {DIENTES.map((diente) => (
                  <option key={diente.fdi} value={diente.fdi}>
                    {diente.fdi} · {diente.nombre}{diente.denticion === "TEMPORAL" ? " (temporal)" : ""}
                  </option>
                ))}
              </select>
              <select name={`superficie-${fila}`} defaultValue={escrito[`superficie-${fila}`] ?? "COMPLETO"} className="w-36 rounded-lg border px-2 py-1.5 text-sm" aria-label={`Cara de la pieza ${fila + 1}`}>
                {SUPERFICIES.map((superficie) => (
                  <option key={superficie} value={superficie}>{superficie === "COMPLETO" ? "Completo" : superficie.charAt(0) + superficie.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end">
        <button disabled={pendiente} className="rounded-lg bg-primary transition-colors hover:bg-rosa-hover px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
          {pendiente ? "Registrando…" : "Registrar procedimiento"}
        </button>
      </div>
    </form>
  );
}
