import Link from "next/link";
import { notFound } from "next/navigation";

import { Arcada, arcada } from "@/components/odontograma/arcada";
import { DIENTES, SUPERFICIES } from "@/lib/dientes";
import {
  colorCondicion,
  CONDICIONES_DENTALES,
  etiquetaCondicion,
  textoSobreCondicion,
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
    <main className="min-h-full bg-background p-5 sm:p-8">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border bg-card p-5 shadow-sm">
          <Link href={`/pacientes/${paciente.id}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Expediente</Link>
          <p className="mt-4 text-sm font-medium text-muted-foreground">CLIDENT · Odontograma</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{paciente.nombres} {paciente.apellidos}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada registro es un evento permanente de la historia clínica. Las correcciones se
            anulan con motivo y el original queda visible — nada se borra ni se reescribe.
          </p>
        </header>

        {estadoAviso === "no-disponible" ? (
          <p role="alert" className="rounded-lg border border-advertencia/40 bg-advertencia-suave px-3 py-2 text-sm text-foreground">
            La operación no se pudo completar. Recargá la página y volvé a intentarlo.
          </p>
        ) : null}

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Dentición permanente</h2>
          <div className="overflow-x-auto">
            <Arcada dientes={arcada(1, 2)} estados={estados} arriba etiqueta="Arcada superior, dentición permanente" />
            <Arcada dientes={arcada(4, 3)} estados={estados} arriba={false} etiqueta="Arcada inferior, dentición permanente" />
          </div>

          {mostrarTemporal ? (
            <>
              <h2 className="pt-4 text-lg font-semibold">Dentición temporal</h2>
              <div className="overflow-x-auto">
                <Arcada dientes={arcada(5, 6)} estados={estados} arriba etiqueta="Arcada superior, dentición temporal" />
                <Arcada dientes={arcada(8, 7)} estados={estados} arriba={false} etiqueta="Arcada inferior, dentición temporal" />
              </div>
            </>
          ) : null}

          {/* La leyenda muestra letra Y color juntos: es lo que permite leer el
              odontograma sin distinguir los colores, y lo que enseña el código
              de letras a quien sí los distingue. */}
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
            {CONDICIONES_DENTALES.map((entrada) => (
              <li key={entrada.condicion} className="flex items-center gap-1.5">
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-[5px] text-[9px] font-bold leading-none"
                  style={{ backgroundColor: entrada.color, color: textoSobreCondicion(entrada.condicion) }}
                  aria-hidden="true"
                >
                  {entrada.letra}
                </span>
                {entrada.etiqueta}
              </li>
            ))}
          </ul>
        </section>

        {puedeEscribir ? (
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
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
                <span className="mt-1 block text-xs font-normal text-muted-foreground">Vacío = ahora. Permite registrar hallazgos retroactivos sin alterar los más recientes.</span>
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
                <button className="rounded-lg bg-primary transition-colors hover:bg-rosa-hover px-4 py-2 text-sm font-medium text-primary-foreground">Registrar</button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Historia de eventos</h2>
          {odontograma.eventos.length === 0 ? (
            <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
              Este paciente todavía no tiene registros en el odontograma.
            </p>
          ) : (
            <ul className="space-y-2">
              {odontograma.eventos.map((evento) => (
                <li key={evento.id} className={`rounded-xl border bg-card p-4 text-sm shadow-sm ${evento.anulado ? "opacity-60" : ""}`}>
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
                        {evento.anulado ? <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive no-underline">Anulado</span> : null}
                      </p>
                      {evento.motivoAnulacion ? <p className="mt-1 text-xs text-muted-foreground">Motivo: {evento.motivoAnulacion}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ocurrió: {fechaHora(evento.ocurridoEn)} · Registrado por {evento.registradoPorNombre}
                      </p>
                    </div>
                    {puedeEscribir && !evento.anulado && evento.tipo !== "CONDICION_ANULADA" ? (
                      <details className="text-sm">
                        <summary className="cursor-pointer font-medium text-foreground">Anular</summary>
                        <form action={anularEventoOdontogramaDesdeFormulario} className="mt-3 w-full space-y-2 sm:w-72">
                          <input type="hidden" name="pacienteId" value={paciente.id} />
                          <input type="hidden" name="eventoId" value={evento.id} />
                          <label className="block text-xs font-medium text-foreground">Motivo de anulación
                            <textarea name="motivoAnulacion" required maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-normal" />
                          </label>
                          <button className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive">Confirmar anulación</button>
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
