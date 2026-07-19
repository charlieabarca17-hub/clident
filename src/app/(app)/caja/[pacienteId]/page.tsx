import Link from "next/link";
import { notFound } from "next/navigation";

import { formatearUSD, usdEditable } from "@/lib/money";
import { hoyElSalvador } from "@/lib/fechas";
import {
  anularCargoDesdeFormulario,
  anularPagoDesdeFormulario,
  aplicarPagoDesdeFormulario,
  crearCargoDesdeProcedimientos,
  crearCargoLibre,
  registrarPagoDesdeFormulario,
  reversarAplicacionDesdeFormulario,
} from "@/server/actions/caja";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso, tienePermiso } from "@/server/auth/permissions";
import { getEstadoCuenta, listarRealizadosSinCargo } from "@/server/db/caja";
import { listarPlanes } from "@/server/db/planes";

type CuentaPageProps = {
  params: Promise<{ pacienteId: string }>;
  searchParams: Promise<{ estado?: string | string[] }>;
};

const ETIQUETA_CARGO: Record<string, { texto: string; clase: string }> = {
  PENDIENTE: { texto: "Pendiente", clase: "bg-neutral-100 text-neutral-700" },
  PARCIAL: { texto: "Parcial", clase: "bg-sky-50 text-sky-700" },
  PAGADO: { texto: "Pagado", clase: "bg-emerald-50 text-emerald-700" },
  ANULADO: { texto: "Anulado", clase: "bg-red-50 text-red-700" },
};

function Saldo({ etiqueta, centavos, destacado }: { etiqueta: string; centavos: number; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${destacado ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white"}`}>
      <p className={`text-xs uppercase tracking-wide ${destacado ? "text-neutral-300" : "text-neutral-500"}`}>{etiqueta}</p>
      <p className="mt-1 font-mono text-xl font-semibold">{formatearUSD(centavos)}</p>
    </div>
  );
}

function FormularioMotivo({
  action,
  etiqueta,
  campos,
}: {
  action: (formData: FormData) => Promise<never>;
  etiqueta: string;
  campos: Record<string, string>;
}) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-medium text-red-700">{etiqueta}</summary>
      <form action={action} className="mt-2 w-60 space-y-2">
        {Object.entries(campos).map(([nombre, valor]) => (
          <input key={nombre} type="hidden" name={nombre} value={valor} />
        ))}
        <textarea name="motivo" required maxLength={1000} rows={2} placeholder="Motivo" className="w-full rounded-lg border px-2 py-1.5" />
        <button className="rounded-lg border border-red-300 px-3 py-1.5 font-medium text-red-800">Confirmar</button>
      </form>
    </details>
  );
}

export default async function EstadoCuentaPage({ params, searchParams }: CuentaPageProps) {
  const [{ pacienteId }, consulta] = await Promise.all([params, searchParams]);
  const aviso = typeof consulta.estado === "string" ? consulta.estado : undefined;
  const ctx = await requireCtx();
  requirePermiso(ctx, "caja:read");

  const cuenta = await getEstadoCuenta(ctx, pacienteId);
  if (!cuenta) notFound();
  const puedeEscribir = tienePermiso(ctx.roles, "caja:write");

  const [pendientesTodos, planes] = puedeEscribir
    ? await Promise.all([listarRealizadosSinCargo(ctx), listarPlanes(ctx, pacienteId)])
    : [[], []];
  const pendientes = pendientesTodos.filter((p) => p.pacienteId === pacienteId);
  const itemsParaCuotas = planes
    .filter((plan) => plan.estado === "ACEPTADO")
    .flatMap((plan) =>
      plan.items.filter((item) =>
        item.estado === "ACEPTADO" || item.estado === "EN_PROCESO" || item.estado === "COMPLETADO",
      ),
    );
  const pagosConSaldo = cuenta.pagos.filter(
    (pago) => !pago.anuladoEn && pago.montoAplicadoCentavos < pago.montoCentavos,
  );
  const hoy = hoyElSalvador();

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <Link href="/caja" className="text-sm text-neutral-600 underline-offset-4 hover:underline">← Caja</Link>
          <p className="mt-4 text-sm font-medium text-neutral-500">CLIDENT · Estado de cuenta</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {cuenta.paciente.nombres} {cuenta.paciente.apellidos}
          </h1>
        </header>

        {aviso === "no-disponible" ? (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            La operación no se pudo completar. Recargá la página y volvé a intentarlo.
          </p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Saldos">
          <Saldo etiqueta="Debe hoy" centavos={cuenta.saldos.exigibleCentavos} destacado />
          <Saldo etiqueta="En mora" centavos={cuenta.saldos.vencidoCentavos} />
          <Saldo etiqueta="Cuotas futuras" centavos={cuenta.saldos.futuroCentavos} />
          <Saldo etiqueta="Total cargado sin pagar" centavos={cuenta.saldos.totalCargadoCentavos} />
          <Saldo etiqueta="Saldo a favor" centavos={cuenta.saldos.creditoAFavorCentavos} />
        </section>

        {puedeEscribir ? (
          <section className="grid gap-6 lg:grid-cols-2">
            {pendientes.length > 0 ? (
              <form action={crearCargoDesdeProcedimientos} className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Cobrar procedimientos realizados</h2>
                <input type="hidden" name="pacienteId" value={cuenta.paciente.id} />
                {pendientes.map((procedimiento) => (
                  <div key={procedimiento.id} className="rounded-lg border p-3 text-sm">
                    <label className="flex items-center gap-2 font-medium">
                      <input type="checkbox" name="procedimientoIds" value={procedimiento.id} defaultChecked />
                      {procedimiento.tratamientoNombre}
                    </label>
                    <div className="mt-2 flex gap-2">
                      <label className="flex-1 text-xs text-neutral-600">Precio (USD)
                        <input name={`precio-${procedimiento.id}`} defaultValue={usdEditable(procedimiento.precioAplicadoCentavos)} inputMode="decimal" className="mt-1 w-full rounded-lg border px-2 py-1.5" />
                      </label>
                      <label className="flex-1 text-xs text-neutral-600">Descuento (USD)
                        <input name={`descuento-${procedimiento.id}`} placeholder="0.00" inputMode="decimal" className="mt-1 w-full rounded-lg border px-2 py-1.5" />
                      </label>
                    </div>
                  </div>
                ))}
                <label className="block text-sm font-medium">Exigible desde *
                  <input name="fechaExigibleEn" type="date" required defaultValue={hoy} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                </label>
                <input type="hidden" name="descripcion" value="Cobro de procedimientos" />
                <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Crear cargo</button>
              </form>
            ) : (
              <form action={crearCargoLibre} className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Nuevo cargo</h2>
                <input type="hidden" name="pacienteId" value={cuenta.paciente.id} />
                <label className="block text-sm font-medium">Descripción *
                  <input name="descripcion" required maxLength={300} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium">Precio (USD) *
                    <input name="precio" required inputMode="decimal" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                  </label>
                  <label className="block text-sm font-medium">Descuento (USD)
                    <input name="descuento" inputMode="decimal" placeholder="0.00" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                  </label>
                </div>
                <label className="block text-sm font-medium">Exigible desde *
                  <input name="fechaExigibleEn" type="date" required defaultValue={hoy} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                </label>
                <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Crear cargo</button>
              </form>
            )}

            <div className="space-y-6">
              <form action={registrarPagoDesdeFormulario} className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Registrar pago</h2>
                <input type="hidden" name="pacienteId" value={cuenta.paciente.id} />
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium">Monto (USD) *
                    <input name="monto" required inputMode="decimal" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                  </label>
                  <label className="block text-sm font-medium">Método *
                    <select name="metodo" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TARJETA">Tarjeta</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="OTRO">Otro</option>
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-medium">Referencia
                  <input name="referencia" maxLength={120} placeholder="N.º de transferencia o cheque" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                </label>
                <p className="text-xs text-neutral-500">
                  Un pago sin aplicar queda como saldo a favor. Repartirlo entre cargos es una
                  decisión aparte, siempre humana.
                </p>
                <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Registrar</button>
              </form>

              {itemsParaCuotas.length > 0 ? (
                <form method="get" action={`/caja/${cuenta.paciente.id}/cuotas`} className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold">Calendario de cuotas</h2>
                  <p className="text-xs text-neutral-500">
                    Para tratamientos aceptados (ej. ortodoncia). Verás todas las fechas antes de confirmar.
                  </p>
                  <label className="block text-sm font-medium">Tratamiento *
                    <select name="planItemId" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                      {itemsParaCuotas.map((item) => (
                        <option key={item.id} value={item.id}>{item.tratamientoNombre}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block text-sm font-medium">Cuotas *
                      <input name="n" type="number" min={1} max={120} required defaultValue={18} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                    </label>
                    <label className="block text-sm font-medium">Monto c/u *
                      <input name="monto" required inputMode="decimal" placeholder="60.00" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                    </label>
                    <label className="block text-sm font-medium">Primera cuota *
                      <input name="inicio" type="date" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                    </label>
                  </div>
                  <button className="rounded-lg border px-4 py-2 text-sm font-medium">Ver calendario →</button>
                </form>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <h2 className="border-b bg-neutral-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-neutral-600">Cargos</h2>
          {cuenta.cargos.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-600">Sin cargos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Exigible</th>
                    <th className="px-5 py-3 font-medium">Descripción</th>
                    <th className="px-5 py-3 text-right font-medium">Monto</th>
                    <th className="px-5 py-3 text-right font-medium">Aplicado</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    {puedeEscribir ? <th className="px-5 py-3 font-medium" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cuenta.cargos.map((cargo) => {
                    const etiqueta = ETIQUETA_CARGO[cargo.estado];
                    const esFuturo = cargo.fechaExigibleEn > hoy && !cargo.anuladoEn;
                    return (
                      <tr key={cargo.id} className={cargo.estado === "ANULADO" ? "text-neutral-400" : ""}>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs">
                          {cargo.fechaExigibleEn}
                          {esFuturo ? <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">futura</span> : null}
                        </td>
                        <td className="px-5 py-3">
                          {cargo.descripcion}
                          {cargo.motivoAnulacion ? <span className="block text-xs text-red-700">Anulado: {cargo.motivoAnulacion}</span> : null}
                        </td>
                        <td className="px-5 py-3 text-right font-mono">{formatearUSD(cargo.montoCentavos)}</td>
                        <td className="px-5 py-3 text-right font-mono">{formatearUSD(cargo.montoAplicadoCentavos)}</td>
                        <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${etiqueta.clase}`}>{etiqueta.texto}</span></td>
                        {puedeEscribir ? (
                          <td className="px-5 py-3">
                            <div className="flex flex-col items-end gap-1.5">
                              {!cargo.anuladoEn && cargo.montoAplicadoCentavos < cargo.montoCentavos && pagosConSaldo.length > 0 ? (
                                <details className="text-xs">
                                  <summary className="cursor-pointer font-medium text-neutral-700">Aplicar pago</summary>
                                  <form action={aplicarPagoDesdeFormulario} className="mt-2 w-60 space-y-2">
                                    <input type="hidden" name="pacienteId" value={cuenta.paciente.id} />
                                    <input type="hidden" name="cargoId" value={cargo.id} />
                                    <select name="pagoId" required className="w-full rounded-lg border px-2 py-1.5">
                                      {pagosConSaldo.map((pago) => (
                                        <option key={pago.id} value={pago.id}>
                                          {pago.metodo} · disponible {formatearUSD(pago.montoCentavos - pago.montoAplicadoCentavos)}
                                        </option>
                                      ))}
                                    </select>
                                    <input name="monto" required inputMode="decimal" placeholder="Monto a aplicar (USD)" defaultValue={usdEditable(cargo.montoCentavos - cargo.montoAplicadoCentavos)} className="w-full rounded-lg border px-2 py-1.5" />
                                    <button className="rounded-lg border px-3 py-1.5 font-medium">Aplicar</button>
                                  </form>
                                </details>
                              ) : null}
                              {!cargo.anuladoEn && cargo.montoAplicadoCentavos === 0 ? (
                                <FormularioMotivo action={anularCargoDesdeFormulario} etiqueta="Anular" campos={{ pacienteId: cuenta.paciente.id, cargoId: cargo.id }} />
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

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <h2 className="border-b bg-neutral-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-neutral-600">Pagos</h2>
          {cuenta.pagos.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-600">Sin pagos registrados.</p>
          ) : (
            <ul className="divide-y text-sm">
              {cuenta.pagos.map((pago) => (
                <li key={pago.id} className={`px-5 py-4 ${pago.anuladoEn ? "text-neutral-400" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {formatearUSD(pago.montoCentavos)} · {pago.metodo}
                        {pago.referencia ? <span className="ml-2 font-mono text-xs text-neutral-500">{pago.referencia}</span> : null}
                        {pago.anuladoEn ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Anulado</span> : null}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Aplicado: {formatearUSD(pago.montoAplicadoCentavos)} · Disponible: {formatearUSD(pago.montoCentavos - pago.montoAplicadoCentavos)}
                      </p>
                      {pago.motivoAnulacion ? <p className="mt-1 text-xs text-red-700">Motivo: {pago.motivoAnulacion}</p> : null}
                      {pago.aplicaciones.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs text-neutral-600">
                          {pago.aplicaciones.map((aplicacion) => (
                            <li key={aplicacion.id} className="flex items-center gap-2">
                              <span className="font-mono">{formatearUSD(aplicacion.montoCentavos)}</span>
                              <span>{aplicacion.reversaDeAplicacionId ? `reversa (${aplicacion.motivoReversa})` : "aplicado a cargo"}</span>
                              {puedeEscribir && !aplicacion.reversaDeAplicacionId && aplicacion.montoCentavos > 0 && !pago.aplicaciones.some((otra) => otra.reversaDeAplicacionId === aplicacion.id) ? (
                                <FormularioMotivo action={reversarAplicacionDesdeFormulario} etiqueta="Reversar" campos={{ pacienteId: cuenta.paciente.id, aplicacionId: aplicacion.id }} />
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    {puedeEscribir && !pago.anuladoEn && pago.montoAplicadoCentavos === 0 ? (
                      <FormularioMotivo action={anularPagoDesdeFormulario} etiqueta="Anular pago" campos={{ pacienteId: cuenta.paciente.id, pagoId: pago.id }} />
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
