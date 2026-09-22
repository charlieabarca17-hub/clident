"use client";

import { useActionState } from "react";

import { DIENTES, SUPERFICIES } from "@/lib/dientes";
import { CONDICIONES_DENTALES } from "@/lib/odontograma";
import { avisoDeFormulario, ESTADO_INICIAL } from "@/lib/formulario";
import { registrarCondicionDesdeFormulario } from "@/server/actions/odontograma";

/**
 * Es un componente de cliente por una sola razón: `useActionState` es lo que
 * permite que la Server Action devuelva el error **y** lo ya escrito sin pasar por
 * la URL. Nada de lo que recibe es dato sensible: la lista de piezas y condiciones
 * es una constante del proyecto, y las descripciones de diagnóstico ya se pintan
 * en esta misma pantalla.
 */
export function FormularioCondicion({
  pacienteId,
  diagnosticos,
  fdiInicial,
  caraInicial,
}: {
  pacienteId: string;
  diagnosticos: ReadonlyArray<{ id: string; descripcion: string }>;
  /** Vienen del clic en el odontograma. Lo que el usuario ya tecleó manda sobre esto. */
  fdiInicial?: number | null;
  caraInicial?: string | null;
}) {
  const [estado, accion, pendiente] = useActionState(
    registrarCondicionDesdeFormulario,
    ESTADO_INICIAL,
  );
  const escrito = estado.valores;

  return (
    <form action={accion} className="mt-4 grid gap-4 sm:grid-cols-2">
      {estado.mensajes.length > 0 ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2"
        >
          <p className="font-medium">{avisoDeFormulario(estado.estado, "el hallazgo").titulo}</p>
          <ul className="mt-1 list-disc pl-5">
            {estado.mensajes.map((mensaje) => <li key={mensaje}>{mensaje}</li>)}
          </ul>
          <p className="mt-2 text-xs">{avisoDeFormulario(estado.estado, "el hallazgo").pie}</p>
        </div>
      ) : null}

      <input type="hidden" name="pacienteId" value={pacienteId} />
      <label className="block text-sm font-medium">Pieza *
        <select name="fdi" required defaultValue={escrito.fdi ?? (fdiInicial ? String(fdiInicial) : "")} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
          <option value="">— Elegí la pieza —</option>
          {DIENTES.map((diente) => (
            <option key={diente.fdi} value={diente.fdi}>
              {diente.fdi} · {diente.nombre}{diente.denticion === "TEMPORAL" ? " (temporal)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">Cara *
        <select name="superficie" required defaultValue={escrito.superficie ?? caraInicial ?? "COMPLETO"} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
          {SUPERFICIES.map((superficie) => (
            <option key={superficie} value={superficie}>
              {superficie === "COMPLETO" ? "Pieza completa" : superficie.charAt(0) + superficie.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">Condición *
        <select name="condicion" required defaultValue={escrito.condicion ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
          {CONDICIONES_DENTALES.map((entrada) => (
            <option key={entrada.condicion} value={entrada.condicion}>{entrada.etiqueta}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">Fecha del hallazgo
        <input name="ocurridoEn" type="datetime-local" defaultValue={escrito.ocurridoEn ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">Vacío = ahora. Permite registrar hallazgos retroactivos sin alterar los más recientes.</span>
      </label>
      <label className="block text-sm font-medium sm:col-span-2">Diagnóstico vinculado
        <select name="diagnosticoId" defaultValue={escrito.diagnosticoId ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
          <option value="">— Ninguno —</option>
          {diagnosticos.map((dx) => (
            <option key={dx.id} value={dx.id}>{dx.descripcion}</option>
          ))}
        </select>
      </label>
      <div className="flex justify-end sm:col-span-2">
        <button disabled={pendiente} className="rounded-lg bg-primary transition-colors hover:bg-rosa-hover px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
          {pendiente ? "Registrando…" : "Registrar"}
        </button>
      </div>
    </form>
  );
}
