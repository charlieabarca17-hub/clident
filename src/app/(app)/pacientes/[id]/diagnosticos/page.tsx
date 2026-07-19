import Link from "next/link";
import { notFound } from "next/navigation";

import { DIENTES, SUPERFICIES } from "@/lib/dientes";
import {
  anularDiagnosticoDesdeFormulario,
  crearDiagnosticoDesdeFormulario,
} from "@/server/actions/diagnosticos";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso, tienePermiso } from "@/server/auth/permissions";
import { listarDiagnosticos } from "@/server/db/diagnosticos";
import { getPacienteAdministrativo } from "@/server/db/pacientes";

type DiagnosticosPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estado?: string | string[] }>;
};

const FILAS_DIENTES = 10;

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

export default async function DiagnosticosPage({ params, searchParams }: DiagnosticosPageProps) {
  const [{ id }, consulta] = await Promise.all([params, searchParams]);
  const estado = typeof consulta.estado === "string" ? consulta.estado : undefined;
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:read");
  const paciente = await getPacienteAdministrativo(ctx, id);
  if (!paciente) notFound();

  const diagnosticos = await listarDiagnosticos(ctx, id);
  const puedeEscribir = tienePermiso(ctx.roles, "clinico:write");

  return (
    <main className="min-h-full bg-background p-5 sm:p-8">
      <section className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl border bg-card p-5 shadow-sm">
          <Link href={`/pacientes/${paciente.id}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Expediente</Link>
          <p className="mt-4 text-sm font-medium text-muted-foreground">CLIDENT · Diagnósticos</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{paciente.nombres} {paciente.apellidos}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Un diagnóstico es un acto profesional: se registra, se anula con motivo si fue un
            error, y nunca se borra ni se edita.
          </p>
        </header>

        {estado === "no-disponible" || estado === "paciente-no-disponible" ? (
          <p role="alert" className="rounded-lg border border-advertencia/40 bg-advertencia-suave px-3 py-2 text-sm text-foreground">
            La operación no se pudo completar. Recargá la página y volvé a intentarlo.
          </p>
        ) : null}

        {puedeEscribir ? (
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Nuevo diagnóstico</h2>
            <form action={crearDiagnosticoDesdeFormulario} className="mt-4 space-y-4">
              <input type="hidden" name="pacienteId" value={paciente.id} />
              <label className="block text-sm font-medium">Diagnóstico *
                <input name="descripcion" required maxLength={300} placeholder="Ej.: Pulpitis irreversible" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-medium">Notas clínicas
                <textarea name="notas" maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-medium sm:w-72">Alcance *
                <select name="alcance" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                  <option value="DIENTE">Por pieza (indicá las piezas abajo)</option>
                  <option value="PACIENTE">General del paciente (ej. bruxismo)</option>
                </select>
              </label>

              <fieldset className="rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">Piezas afectadas</legend>
                <p className="mb-3 text-xs text-muted-foreground">
                  Solo para diagnósticos por pieza. «Completo» registra la pieza entera; las
                  demás opciones señalan una cara específica.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Array.from({ length: FILAS_DIENTES }, (_, fila) => (
                    <div key={fila} className="flex gap-2">
                      <select name={`diente-${fila}`} defaultValue="" className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm" aria-label={`Pieza ${fila + 1}`}>
                        <option value="">— Pieza —</option>
                        {DIENTES.map((diente) => (
                          <option key={diente.fdi} value={diente.fdi}>
                            {diente.fdi} · {diente.nombre}{diente.denticion === "TEMPORAL" ? " (temporal)" : ""}
                          </option>
                        ))}
                      </select>
                      <select name={`superficie-${fila}`} defaultValue="COMPLETO" className="w-36 rounded-lg border px-2 py-1.5 text-sm" aria-label={`Cara de la pieza ${fila + 1}`}>
                        {SUPERFICIES.map((superficie) => (
                          <option key={superficie} value={superficie}>{superficie === "COMPLETO" ? "Completo" : superficie.charAt(0) + superficie.slice(1).toLowerCase()}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </fieldset>

              <div className="flex justify-end">
                <button className="rounded-lg bg-primary transition-colors hover:bg-rosa-hover px-4 py-2 text-sm font-medium text-primary-foreground">Registrar diagnóstico</button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Historial de diagnósticos</h2>
          {diagnosticos.length === 0 ? (
            <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
              Este paciente todavía no tiene diagnósticos registrados.
            </p>
          ) : (
            diagnosticos.map((diagnostico) => (
              <article
                key={diagnostico.id}
                className={`rounded-2xl border bg-card p-5 shadow-sm ${diagnostico.anulado ? "opacity-70" : ""}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`font-semibold ${diagnostico.anulado ? "line-through" : ""}`}>{diagnostico.descripcion}</h3>
                      {diagnostico.anulado ? (
                        <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">Anulado</span>
                      ) : (
                        <span className="rounded-full bg-exito-suave px-2.5 py-0.5 text-xs font-medium text-exito-texto">Vigente</span>
                      )}
                    </div>
                    {diagnostico.dientes.length > 0 ? (
                      <p className="mt-2 flex flex-wrap gap-1.5">
                        {diagnostico.dientes.map((diente) => (
                          <span key={`${diente.fdi}-${diente.superficie}`} className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                            {diente.fdi}{diente.superficie === "COMPLETO" ? "" : ` · ${diente.superficie.toLowerCase()}`}
                          </span>
                        ))}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">General del paciente</p>
                    )}
                    {diagnostico.notas ? <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{diagnostico.notas}</p> : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Registrado por {diagnostico.registradoPorNombre} · {fechaHora(diagnostico.creadoEn)}
                    </p>
                    {diagnostico.anulado ? (
                      <p className="mt-1 text-xs text-destructive">
                        Anulado por {diagnostico.anuladoPorNombre} · {diagnostico.anuladoEn ? fechaHora(diagnostico.anuladoEn) : ""} · Motivo: {diagnostico.motivoAnulacion}
                      </p>
                    ) : null}
                  </div>
                  {puedeEscribir && !diagnostico.anulado ? (
                    <details className="text-sm">
                      <summary className="cursor-pointer font-medium text-foreground">Anular</summary>
                      <form action={anularDiagnosticoDesdeFormulario} className="mt-3 w-full space-y-2 sm:w-72">
                        <input type="hidden" name="pacienteId" value={paciente.id} />
                        <input type="hidden" name="diagnosticoId" value={diagnostico.id} />
                        <label className="block text-xs font-medium text-foreground">Motivo de anulación
                          <textarea name="motivoAnulacion" required maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-normal" />
                        </label>
                        <button className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive">Confirmar anulación</button>
                      </form>
                    </details>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}
