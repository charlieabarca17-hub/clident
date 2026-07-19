import Link from "next/link";
import { notFound } from "next/navigation";

import { DIENTES, SUPERFICIES, type Diente } from "@/lib/dientes";
import {
  colorCondicion,
  CONDICIONES_DENTALES,
  etiquetaCondicion,
} from "@/lib/odontograma";
import {
  anularEventoOdontogramaDesdeFormulario,
  registrarCondicionDesdeFormulario,
} from "@/server/actions/odontograma";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso, tienePermiso } from "@/server/auth/permissions";
import { listarDiagnosticos } from "@/server/db/diagnosticos";
import { getOdontograma } from "@/server/db/odontograma";
import { getPacienteAdministrativo } from "@/server/db/pacientes";
import type { EstadoSuperficieDto } from "@/server/dto/odontograma";

type OdontogramaPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estado?: string | string[] }>;
};

function fechaHora(fecha: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(fecha));
}

function edadEnAnios(fechaNacimiento: string): number {
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00-06:00`);
  return Math.floor((Date.now() - nacimiento.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

/** Orden visual de una arcada: cuadrante derecho de atrás hacia el centro y luego el izquierdo. */
function arcada(cuadranteDerecho: number, cuadranteIzquierdo: number): Diente[] {
  const derecho = DIENTES.filter((d) => d.cuadrante === cuadranteDerecho).sort((a, b) => b.posicion - a.posicion);
  const izquierdo = DIENTES.filter((d) => d.cuadrante === cuadranteIzquierdo).sort((a, b) => a.posicion - b.posicion);
  return [...derecho, ...izquierdo];
}

function DienteCelda({ diente, estados }: { diente: Diente; estados: Map<string, EstadoSuperficieDto> }) {
  const completo = estados.get(`${diente.fdi}:COMPLETO`);
  const caras = diente.superficies
    .filter((s) => s !== "COMPLETO")
    .map((s) => ({ superficie: s, estado: estados.get(`${diente.fdi}:${s}`) }))
    .filter((c) => c.estado);
  const resumen = [
    completo ? `${etiquetaCondicion(completo.condicion)} (pieza completa)` : null,
    ...caras.map((c) => `${etiquetaCondicion(c.estado!.condicion)} (${c.superficie.toLowerCase()})`),
  ].filter(Boolean).join(" · ");

  return (
    <div
      className="flex w-12 flex-col items-center gap-1 rounded-lg border bg-white p-1.5"
      title={resumen || `${diente.fdi} · ${diente.nombre}: sin registros`}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold"
        style={{
          backgroundColor: completo ? colorCondicion(completo.condicion) : "#f8fafc",
          color: completo ? "#ffffff" : "#334155",
          border: completo ? "none" : "1px solid #cbd5e1",
        }}
      >
        {diente.fdi}
      </span>
      <span className="flex h-2 items-center gap-0.5">
        {caras.map((cara) => (
          <span
            key={cara.superficie}
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: colorCondicion(cara.estado!.condicion) }}
          />
        ))}
      </span>
    </div>
  );
}

export default async function OdontogramaPage({ params, searchParams }: OdontogramaPageProps) {
  const [{ id }, consulta] = await Promise.all([params, searchParams]);
  const estadoAviso = typeof consulta.estado === "string" ? consulta.estado : undefined;
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:read");
  const paciente = await getPacienteAdministrativo(ctx, id);
  if (!paciente) notFound();

  const [odontograma, diagnosticos] = await Promise.all([
    getOdontograma(ctx, id),
    listarDiagnosticos(ctx, id),
  ]);
  if (!odontograma) notFound();

  const puedeEscribir = tienePermiso(ctx.roles, "clinico:write");
  const estados = new Map(odontograma.estados.map((e) => [`${e.fdi}:${e.superficie}`, e]));
  const diagnosticosVigentes = diagnosticos.filter((dx) => !dx.anulado);

  const edad = edadEnAnios(paciente.fechaNacimiento);
  const tieneRegistrosTemporales = odontograma.estados.some((e) => e.fdi >= 51);
  const mostrarTemporal = edad < 13 || tieneRegistrosTemporales;

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <Link href={`/pacientes/${paciente.id}`} className="text-sm text-neutral-600 underline-offset-4 hover:underline">← Expediente</Link>
          <p className="mt-4 text-sm font-medium text-neutral-500">CLIDENT · Odontograma</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{paciente.nombres} {paciente.apellidos}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Cada registro es un evento permanente de la historia clínica. Las correcciones se
            anulan con motivo y el original queda visible — nada se borra ni se reescribe.
          </p>
        </header>

        {estadoAviso === "no-disponible" ? (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            La operación no se pudo completar. Recargá la página y volvé a intentarlo.
          </p>
        ) : null}

        <section className="space-y-4 overflow-x-auto rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Dentición permanente</h2>
          <div className="flex min-w-max gap-1">{arcada(1, 2).map((diente) => <DienteCelda key={diente.fdi} diente={diente} estados={estados} />)}</div>
          <div className="flex min-w-max gap-1">{arcada(4, 3).map((diente) => <DienteCelda key={diente.fdi} diente={diente} estados={estados} />)}</div>

          {mostrarTemporal ? (
            <>
              <h2 className="pt-2 text-lg font-semibold">Dentición temporal</h2>
              <div className="flex min-w-max gap-1">{arcada(5, 6).map((diente) => <DienteCelda key={diente.fdi} diente={diente} estados={estados} />)}</div>
              <div className="flex min-w-max gap-1">{arcada(8, 7).map((diente) => <DienteCelda key={diente.fdi} diente={diente} estados={estados} />)}</div>
            </>
          ) : null}

          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-4 text-xs text-neutral-600">
            {CONDICIONES_DENTALES.map((entrada) => (
              <li key={entrada.condicion} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entrada.color }} />
                {entrada.etiqueta}
              </li>
            ))}
          </ul>
        </section>

        {puedeEscribir ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Registrar condición</h2>
            <form action={registrarCondicionDesdeFormulario} className="mt-4 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="pacienteId" value={paciente.id} />
              <label className="block text-sm font-medium">Pieza *
                <select name="fdi" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                  <option value="">— Elegí la pieza —</option>
                  {DIENTES.map((diente) => (
                    <option key={diente.fdi} value={diente.fdi}>
                      {diente.fdi} · {diente.nombre}{diente.denticion === "TEMPORAL" ? " (temporal)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">Cara *
                <select name="superficie" required defaultValue="COMPLETO" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                  {SUPERFICIES.map((superficie) => (
                    <option key={superficie} value={superficie}>
                      {superficie === "COMPLETO" ? "Pieza completa" : superficie.charAt(0) + superficie.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">Condición *
                <select name="condicion" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                  {CONDICIONES_DENTALES.map((entrada) => (
                    <option key={entrada.condicion} value={entrada.condicion}>{entrada.etiqueta}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">Fecha del hallazgo
                <input name="ocurridoEn" type="datetime-local" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                <span className="mt-1 block text-xs font-normal text-neutral-500">Vacío = ahora. Permite registrar hallazgos retroactivos sin alterar los más recientes.</span>
              </label>
              <label className="block text-sm font-medium sm:col-span-2">Diagnóstico vinculado
                <select name="diagnosticoId" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                  <option value="">— Ninguno —</option>
                  {diagnosticosVigentes.map((dx) => (
                    <option key={dx.id} value={dx.id}>{dx.descripcion}</option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end sm:col-span-2">
                <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Registrar</button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Historia de eventos</h2>
          {odontograma.eventos.length === 0 ? (
            <p className="rounded-2xl border bg-white p-8 text-center text-sm text-neutral-600 shadow-sm">
              Este paciente todavía no tiene registros en el odontograma.
            </p>
          ) : (
            <ul className="space-y-2">
              {odontograma.eventos.map((evento) => (
                <li key={evento.id} className={`rounded-xl border bg-white p-4 text-sm shadow-sm ${evento.anulado ? "opacity-60" : ""}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className={`font-medium ${evento.anulado ? "line-through" : ""}`}>
                        {evento.tipo === "CONDICION_ANULADA" ? (
                          <>Anulación de registro · pieza {evento.fdi}</>
                        ) : (
                          <>
                            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: evento.condicion ? colorCondicion(evento.condicion) : "#ccc" }} />
                            {evento.condicion ? etiquetaCondicion(evento.condicion) : evento.tipo} · pieza {evento.fdi}
                            {evento.superficie !== "COMPLETO" ? ` (${evento.superficie.toLowerCase()})` : ""}
                          </>
                        )}
                        {evento.anulado ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 no-underline">Anulado</span> : null}
                      </p>
                      {evento.motivoAnulacion ? <p className="mt-1 text-xs text-neutral-600">Motivo: {evento.motivoAnulacion}</p> : null}
                      <p className="mt-1 text-xs text-neutral-500">
                        Ocurrió: {fechaHora(evento.ocurridoEn)} · Registrado por {evento.registradoPorNombre}
                      </p>
                    </div>
                    {puedeEscribir && !evento.anulado && evento.tipo !== "CONDICION_ANULADA" ? (
                      <details className="text-sm">
                        <summary className="cursor-pointer font-medium text-neutral-700">Anular</summary>
                        <form action={anularEventoOdontogramaDesdeFormulario} className="mt-3 w-full space-y-2 sm:w-72">
                          <input type="hidden" name="pacienteId" value={paciente.id} />
                          <input type="hidden" name="eventoId" value={evento.id} />
                          <label className="block text-xs font-medium text-neutral-700">Motivo de anulación
                            <textarea name="motivoAnulacion" required maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-normal" />
                          </label>
                          <button className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-800">Confirmar anulación</button>
                        </form>
                      </details>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
