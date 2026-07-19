import Link from "next/link";
import { notFound } from "next/navigation";

import { DIENTES, SUPERFICIES } from "@/lib/dientes";
import { formatearUSD } from "@/lib/money";
import {
  aceptarPlanDesdeFormulario,
  agregarPlanItemDesdeFormulario,
  anularPlanDesdeFormulario,
  anularPlanItemDesdeFormulario,
  cancelarPlanItemDesdeFormulario,
  completarPlanItemDesdeFormulario,
  presentarPlanDesdeFormulario,
  rechazarPlanDesdeFormulario,
} from "@/server/actions/planes";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso, tienePermiso } from "@/server/auth/permissions";
import { listarCatalogo } from "@/server/db/catalogo";
import { listarDiagnosticos } from "@/server/db/diagnosticos";
import { getPacienteAdministrativo } from "@/server/db/pacientes";
import { getPlan } from "@/server/db/planes";

type PlanPageProps = { params: Promise<{ id: string; planId: string }> };

const ETIQUETA_PLAN: Record<string, string> = {
  BORRADOR: "Borrador",
  PRESENTADO: "Presentado al paciente",
  ACEPTADO: "Aceptado por el paciente",
  RECHAZADO: "Rechazado por el paciente",
  ANULADO: "Anulado",
};

const ETIQUETA_ITEM: Record<string, { texto: string; clase: string }> = {
  PROPUESTO: { texto: "Propuesto", clase: "bg-neutral-100 text-neutral-700" },
  ACEPTADO: { texto: "Aceptado", clase: "bg-emerald-50 text-emerald-700" },
  EN_PROCESO: { texto: "En proceso", clase: "bg-sky-50 text-sky-700" },
  COMPLETADO: { texto: "Completado", clase: "bg-emerald-100 text-emerald-800" },
  CANCELADO: { texto: "Cancelado", clase: "bg-orange-50 text-orange-700" },
  ANULADO: { texto: "Anulado", clase: "bg-red-50 text-red-700" },
};

const FILAS_DIENTES = 10;

function FormularioMotivo({
  action,
  etiqueta,
  campos,
  clase,
}: {
  action: (formData: FormData) => Promise<never>;
  etiqueta: string;
  campos: Record<string, string>;
  clase?: string;
}) {
  return (
    <details className="text-sm">
      <summary className={`cursor-pointer font-medium ${clase ?? "text-neutral-700"}`}>{etiqueta}</summary>
      <form action={action} className="mt-2 w-64 space-y-2">
        {Object.entries(campos).map(([nombre, valor]) => (
          <input key={nombre} type="hidden" name={nombre} value={valor} />
        ))}
        <label className="block text-xs font-medium text-neutral-700">Motivo
          <textarea name="motivo" required maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-normal" />
        </label>
        <button className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-800">Confirmar</button>
      </form>
    </details>
  );
}

export default async function PlanPage({ params }: PlanPageProps) {
  const { id, planId } = await params;
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:read");
  const [paciente, plan] = await Promise.all([
    getPacienteAdministrativo(ctx, id),
    getPlan(ctx, planId),
  ]);
  if (!paciente || !plan) notFound();

  const puedeEscribir = tienePermiso(ctx.roles, "clinico:write");
  const esBorrador = plan.estado === "BORRADOR";
  const [catalogo, diagnosticos] = esBorrador && puedeEscribir
    ? await Promise.all([listarCatalogo(ctx), listarDiagnosticos(ctx, id)])
    : [[], []];
  const diagnosticosVigentes = diagnosticos.filter((dx) => !dx.anulado);

  const itemsVivos = plan.items.filter((i) => i.estado !== "CANCELADO" && i.estado !== "ANULADO");
  const total = itemsVivos.reduce((suma, item) => suma + item.precioFinalCentavos, 0);
  const propuestos = plan.items.filter((i) => i.estado === "PROPUESTO");

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <Link href={`/pacientes/${paciente.id}/planes`} className="text-sm text-neutral-600 underline-offset-4 hover:underline">← Planes</Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">CLIDENT · Plan de tratamiento</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{plan.titulo ?? "Plan de tratamiento"}</h1>
              <p className="mt-1 text-sm text-neutral-600">
                {paciente.nombres} {paciente.apellidos} · {ETIQUETA_PLAN[plan.estado]}
              </p>
              {plan.motivoAnulacion ? (
                <p className="mt-1 text-sm text-red-700">Motivo de anulación: {plan.motivoAnulacion}</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Total vigente</p>
              <p className="font-mono text-2xl font-semibold">{formatearUSD(total)}</p>
              <p className="mt-1 max-w-52 text-xs text-neutral-500">
                Precios congelados al armar el plan. Aceptar no genera cobros.
              </p>
            </div>
          </div>

          {puedeEscribir ? (
            <div className="mt-5 flex flex-wrap items-center gap-4 border-t pt-4">
              {esBorrador ? (
                <form action={presentarPlanDesdeFormulario}>
                  <input type="hidden" name="pacienteId" value={paciente.id} />
                  <input type="hidden" name="planId" value={plan.id} />
                  <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Presentar al paciente</button>
                </form>
              ) : null}
              {plan.estado === "PRESENTADO" ? (
                <form action={rechazarPlanDesdeFormulario}>
                  <input type="hidden" name="pacienteId" value={paciente.id} />
                  <input type="hidden" name="planId" value={plan.id} />
                  <button className="rounded-lg border px-4 py-2 text-sm font-medium">El paciente lo rechazó</button>
                </form>
              ) : null}
              {plan.estado !== "ANULADO" ? (
                <FormularioMotivo
                  action={anularPlanDesdeFormulario}
                  etiqueta="Anular plan"
                  campos={{ pacienteId: paciente.id, planId: plan.id }}
                  clase="text-red-700"
                />
              ) : null}
            </div>
          ) : null}
        </header>

        {plan.estado === "PRESENTADO" && puedeEscribir && propuestos.length > 0 ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Registrar la decisión del paciente</h2>
            <p className="mt-1 text-sm text-neutral-700">
              Marcá los tratamientos que el paciente aceptó — todos o solo algunos — y confirmá.
              Es una sola acción con un solo registro de auditoría.
            </p>
            <form action={aceptarPlanDesdeFormulario} className="mt-4 space-y-2">
              <input type="hidden" name="pacienteId" value={paciente.id} />
              <input type="hidden" name="planId" value={plan.id} />
              {propuestos.map((item) => (
                <label key={item.id} className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2 text-sm">
                  <input type="checkbox" name="itemIds" value={item.id} defaultChecked />
                  <span className="flex-1">{item.tratamientoNombre}</span>
                  <span className="font-mono">{formatearUSD(item.precioFinalCentavos)}</span>
                </label>
              ))}
              <button className="mt-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
                Confirmar aceptación
              </button>
            </form>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <h2 className="border-b bg-neutral-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-neutral-600">
            Tratamientos del plan
          </h2>
          {plan.items.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-600">Todavía no hay tratamientos en este plan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Tratamiento</th>
                    <th className="px-5 py-3 font-medium">Piezas</th>
                    <th className="px-5 py-3 text-right font-medium">Precio</th>
                    <th className="px-5 py-3 text-right font-medium">Descuento</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    {puedeEscribir ? <th className="px-5 py-3 font-medium" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {plan.items.map((item) => {
                    const etiqueta = ETIQUETA_ITEM[item.estado];
                    return (
                      <tr key={item.id} className={item.estado === "CANCELADO" || item.estado === "ANULADO" ? "text-neutral-400" : ""}>
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-neutral-500">{item.tratamientoCodigo}</span>{" "}
                          <span className="font-medium">{item.tratamientoNombre}</span>
                        </td>
                        <td className="px-5 py-3">
                          {item.dientes.length === 0 ? "—" : item.dientes.map((d) => `${d.fdi}${d.superficie === "COMPLETO" ? "" : ` ${d.superficie.slice(0, 3).toLowerCase()}`}`).join(", ")}
                        </td>
                        <td className="px-5 py-3 text-right font-mono">{formatearUSD(item.precioUnitarioCentavos)}</td>
                        <td className="px-5 py-3 text-right font-mono">{item.descuentoCentavos > 0 ? `−${formatearUSD(item.descuentoCentavos)}` : "—"}</td>
                        <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${etiqueta.clase}`}>{etiqueta.texto}</span></td>
                        {puedeEscribir ? (
                          <td className="px-5 py-3">
                            <div className="flex flex-col items-end gap-1.5">
                              {(item.estado === "ACEPTADO" || item.estado === "EN_PROCESO") && plan.estado === "ACEPTADO" ? (
                                <form action={completarPlanItemDesdeFormulario}>
                                  <input type="hidden" name="pacienteId" value={paciente.id} />
                                  <input type="hidden" name="planId" value={plan.id} />
                                  <input type="hidden" name="itemId" value={item.id} />
                                  <button className="text-xs font-medium text-emerald-700 underline-offset-4 hover:underline">Declarar concluido</button>
                                </form>
                              ) : null}
                              {item.estado === "PROPUESTO" || item.estado === "ACEPTADO" || item.estado === "EN_PROCESO" ? (
                                <FormularioMotivo
                                  action={cancelarPlanItemDesdeFormulario}
                                  etiqueta="Cancelar"
                                  campos={{ pacienteId: paciente.id, planId: plan.id, itemId: item.id }}
                                />
                              ) : null}
                              {item.estado === "COMPLETADO" ? (
                                <FormularioMotivo
                                  action={anularPlanItemDesdeFormulario}
                                  etiqueta="Anular (nunca ocurrió)"
                                  campos={{ pacienteId: paciente.id, planId: plan.id, itemId: item.id }}
                                  clase="text-red-700"
                                />
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {esBorrador && puedeEscribir ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Agregar tratamiento</h2>
            <p className="mt-1 text-sm text-neutral-600">
              El precio del catálogo se copia al plan en este momento y queda congelado:
              cambios futuros del catálogo no tocan este presupuesto.
            </p>
            <form action={agregarPlanItemDesdeFormulario} className="mt-4 space-y-4">
              <input type="hidden" name="pacienteId" value={paciente.id} />
              <input type="hidden" name="planId" value={plan.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">Tratamiento *
                  <select name="tratamientoId" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                    <option value="">— Elegí del catálogo —</option>
                    {catalogo.map((categoria) => (
                      <optgroup key={categoria.id} label={categoria.nombre}>
                        {categoria.tratamientos.filter((t) => t.activo).map((tratamiento) => (
                          <option key={tratamiento.id} value={tratamiento.id}>
                            {tratamiento.codigo} · {tratamiento.nombre} ({formatearUSD(tratamiento.precioListaCentavos)})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">Diagnóstico vinculado
                  <select name="diagnosticoId" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                    <option value="">— Ninguno —</option>
                    {diagnosticosVigentes.map((dx) => (
                      <option key={dx.id} value={dx.id}>{dx.descripcion}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs font-normal text-neutral-500">Obligatorio si el tratamiento lo exige (endodoncias, cirugía periodontal…).</span>
                </label>
                <label className="block text-sm font-medium">Descuento (USD)
                  <input name="descuento" inputMode="decimal" placeholder="0.00" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                </label>
              </div>

              <fieldset className="rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">Piezas (si el tratamiento las lleva)</legend>
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
                <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Agregar al plan</button>
              </div>
            </form>
          </section>
        ) : null}
      </section>
    </main>
  );
}
