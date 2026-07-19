import Link from "next/link";
import { notFound } from "next/navigation";

import { DIENTES, SUPERFICIES } from "@/lib/dientes";
import { formatearUSD } from "@/lib/money";
import { CONDICIONES_DENTALES } from "@/lib/odontograma";
import {
  anularProcedimientoDesdeFormulario,
  editarNotaDesdeFormulario,
  enmendarNotaDesdeFormulario,
  realizarProcedimientoDesdeFormulario,
} from "@/server/actions/procedimientos";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso, tienePermiso } from "@/server/auth/permissions";
import { getPacienteAdministrativo } from "@/server/db/pacientes";
import { listarPlanes } from "@/server/db/planes";
import { listarProcedimientos } from "@/server/db/procedimientos";

type ProcedimientosPageProps = {
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

export default async function ProcedimientosPage({ params, searchParams }: ProcedimientosPageProps) {
  const [{ id }, consulta] = await Promise.all([params, searchParams]);
  const aviso = typeof consulta.estado === "string" ? consulta.estado : undefined;
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:read");
  const paciente = await getPacienteAdministrativo(ctx, id);
  if (!paciente) notFound();

  const [procedimientos, planes] = await Promise.all([
    listarProcedimientos(ctx, id),
    listarPlanes(ctx, id),
  ]);
  const puedeEscribir = tienePermiso(ctx.roles, "clinico:write");

  // Solo los tratamientos de planes ACEPTADOS, en estado realizable.
  const itemsRealizables = planes
    .filter((plan) => plan.estado === "ACEPTADO")
    .flatMap((plan) =>
      plan.items
        .filter((item) => item.estado === "ACEPTADO" || item.estado === "EN_PROCESO")
        .map((item) => ({ ...item, planTitulo: plan.titulo ?? "Plan de tratamiento" })),
    );

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <Link href={`/pacientes/${paciente.id}`} className="text-sm text-neutral-600 underline-offset-4 hover:underline">← Expediente</Link>
          <p className="mt-4 text-sm font-medium text-neutral-500">CLIDENT · Procedimientos realizados</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{paciente.nombres} {paciente.apellidos}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Un procedimiento es un hecho ocurrido: qué, cuándo, quién y a qué precio no se
            reescriben. Registrarlo no genera ningún cobro — eso lo decide Caja.
          </p>
        </header>

        {aviso === "no-disponible" ? (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            La operación no se pudo completar. Recargá la página y volvé a intentarlo.
          </p>
        ) : null}

        {puedeEscribir ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Registrar procedimiento</h2>
            {itemsRealizables.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-600">
                No hay tratamientos aceptados pendientes. Primero armá un plan, presentalo y
                registrá la aceptación del paciente.
              </p>
            ) : (
              <form action={realizarProcedimientoDesdeFormulario} className="mt-4 space-y-4">
                <input type="hidden" name="pacienteId" value={paciente.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium sm:col-span-2">Tratamiento del plan *
                    <select name="planItemId" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                      <option value="">— Elegí el tratamiento aceptado —</option>
                      {itemsRealizables.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.tratamientoNombre} · {item.planTitulo} ({item.estado === "EN_PROCESO" ? "en proceso" : "aceptado"})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">Fecha y hora
                    <input name="realizadoEn" type="datetime-local" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                    <span className="mt-1 block text-xs font-normal text-neutral-500">Vacío = ahora.</span>
                  </label>
                  <label className="block text-sm font-medium">La pieza queda como
                    <select name="condicionResultante" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                      <option value="">— Sin cambio en el odontograma —</option>
                      {CONDICIONES_DENTALES.map((entrada) => (
                        <option key={entrada.condicion} value={entrada.condicion}>{entrada.etiqueta}</option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs font-normal text-neutral-500">Obligatorio si indicás piezas: pinta el odontograma.</span>
                  </label>
                  <label className="block text-sm font-medium sm:col-span-2">Nota clínica
                    <textarea name="notasClinicas" maxLength={5000} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                    <span className="mt-1 block text-xs font-normal text-neutral-500">
                      Editable por vos durante 12 horas; después, solo por enmienda que preserva el texto original.
                    </span>
                  </label>
                </div>

                <fieldset className="rounded-lg border p-4">
                  <legend className="px-1 text-sm font-medium">Piezas tratadas</legend>
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
                  <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Registrar procedimiento</button>
                </div>
              </form>
            )}
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Historial de procedimientos</h2>
          {procedimientos.length === 0 ? (
            <p className="rounded-2xl border bg-white p-8 text-center text-sm text-neutral-600 shadow-sm">
              Este paciente todavía no tiene procedimientos registrados.
            </p>
          ) : (
            procedimientos.map((procedimiento) => (
              <article
                key={procedimiento.id}
                className={`rounded-2xl border bg-white p-5 shadow-sm ${procedimiento.estado === "ANULADO" ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`font-semibold ${procedimiento.estado === "ANULADO" ? "line-through" : ""}`}>
                        <span className="font-mono text-xs text-neutral-500">{procedimiento.tratamientoCodigo}</span>{" "}
                        {procedimiento.tratamientoNombre}
                      </h3>
                      {procedimiento.estado === "ANULADO" ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">Anulado</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Realizado</span>
                      )}
                    </div>
                    {procedimiento.dientes.length > 0 ? (
                      <p className="mt-2 flex flex-wrap gap-1.5">
                        {procedimiento.dientes.map((diente) => (
                          <span key={`${diente.fdi}-${diente.superficie}`} className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-xs">
                            {diente.fdi}{diente.superficie === "COMPLETO" ? "" : ` · ${diente.superficie.toLowerCase()}`}
                          </span>
                        ))}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-neutral-500">
                      {fechaHora(procedimiento.realizadoEn)} · {procedimiento.odontologoNombre} · {formatearUSD(procedimiento.precioAplicadoCentavos)}
                    </p>
                    {procedimiento.notasClinicas ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">{procedimiento.notasClinicas}</p>
                    ) : null}
                    {procedimiento.enmiendas.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {procedimiento.enmiendas.map((enmienda) => (
                          <details key={enmienda.id} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-600">
                            <summary className="cursor-pointer font-medium">
                              Enmienda · {fechaHora(enmienda.creadoEn)} · {enmienda.creadaPorNombre}
                            </summary>
                            <p className="mt-2"><strong>Motivo:</strong> {enmienda.motivo}</p>
                            <p className="mt-1"><strong>Texto anterior:</strong> {enmienda.textoAnterior ?? "(sin nota)"}</p>
                          </details>
                        ))}
                      </div>
                    ) : null}
                    {procedimiento.motivoAnulacion ? (
                      <p className="mt-2 text-xs text-red-700">Motivo de anulación: {procedimiento.motivoAnulacion}</p>
                    ) : null}
                  </div>

                  {puedeEscribir && procedimiento.estado === "REALIZADO" ? (
                    <div className="flex flex-col items-end gap-2 text-sm">
                      <details>
                        <summary className="cursor-pointer font-medium text-neutral-700">Corregir nota</summary>
                        <div className="mt-2 w-72 space-y-3">
                          <form action={editarNotaDesdeFormulario} className="space-y-2 rounded-lg border p-3">
                            <p className="text-xs font-medium text-neutral-600">Edición directa (12 h, solo el autor)</p>
                            <input type="hidden" name="pacienteId" value={paciente.id} />
                            <input type="hidden" name="procedimientoId" value={procedimiento.id} />
                            <textarea name="notasClinicas" required maxLength={5000} rows={2} defaultValue={procedimiento.notasClinicas ?? ""} className="w-full rounded-lg border px-2 py-1.5 text-sm font-normal" />
                            <button className="rounded-lg border px-3 py-1.5 text-xs font-medium">Guardar</button>
                          </form>
                          <form action={enmendarNotaDesdeFormulario} className="space-y-2 rounded-lg border p-3">
                            <p className="text-xs font-medium text-neutral-600">Enmienda (preserva el texto original)</p>
                            <input type="hidden" name="pacienteId" value={paciente.id} />
                            <input type="hidden" name="procedimientoId" value={procedimiento.id} />
                            <label className="block text-xs font-medium text-neutral-700">Texto corregido
                              <textarea name="textoNuevo" required maxLength={5000} rows={2} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-normal" />
                            </label>
                            <label className="block text-xs font-medium text-neutral-700">Motivo
                              <input name="motivo" required maxLength={1000} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-normal" />
                            </label>
                            <button className="rounded-lg border px-3 py-1.5 text-xs font-medium">Registrar enmienda</button>
                          </form>
                        </div>
                      </details>
                      <details>
                        <summary className="cursor-pointer font-medium text-red-700">Anular</summary>
                        <form action={anularProcedimientoDesdeFormulario} className="mt-2 w-72 space-y-2">
                          <input type="hidden" name="pacienteId" value={paciente.id} />
                          <input type="hidden" name="procedimientoId" value={procedimiento.id} />
                          <label className="block text-xs font-medium text-neutral-700">Motivo de anulación
                            <textarea name="motivoAnulacion" required maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-normal" />
                          </label>
                          <p className="text-xs text-neutral-500">
                            El procedimiento queda visible como anulado y el odontograma se
                            recalcula con eventos compensatorios. Nada se borra.
                          </p>
                          <button className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-800">Confirmar anulación</button>
                        </form>
                      </details>
                    </div>
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
