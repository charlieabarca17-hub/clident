import Link from "next/link";

import { formatearUSD } from "@/lib/money";
import { requireCtx } from "@/server/auth/context";
import { getDashboard } from "@/server/db/dashboard";

function hora(iso: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function fechaLarga(fechaCivil: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${fechaCivil}T12:00:00Z`));
}

function Kpi({
  etiqueta,
  valor,
  nota,
  destacado,
  alerta,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  destacado?: boolean;
  alerta?: boolean;
}) {
  const clase = destacado
    ? "border-neutral-900 bg-neutral-900 text-white"
    : alerta
      ? "border-amber-300 bg-amber-50"
      : "bg-white";
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${clase}`}>
      <p className={`text-xs uppercase tracking-wide ${destacado ? "text-neutral-300" : "text-neutral-500"}`}>
        {etiqueta}
      </p>
      <p className="mt-1.5 font-mono text-2xl font-semibold">{valor}</p>
      {nota ? (
        <p className={`mt-1 text-xs ${destacado ? "text-neutral-400" : "text-neutral-500"}`}>{nota}</p>
      ) : null}
    </div>
  );
}

export default async function DashboardPage() {
  const ctx = await requireCtx();
  const tablero = await getDashboard(ctx);

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">CLIDENT · Tablero</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight capitalize">
            {fechaLarga(tablero.hoy)}
          </h1>
          <nav className="mt-4 flex flex-wrap gap-2 border-t pt-4 text-sm">
            <Link href="/agenda" className="rounded-full border px-3 py-1.5 font-medium">Agenda</Link>
            <Link href="/pacientes" className="rounded-full border px-3 py-1.5 font-medium">Pacientes</Link>
            <Link href="/catalogo" className="rounded-full border px-3 py-1.5 font-medium">Catálogo</Link>
            {tablero.cuentasPorCobrarCentavos !== null ? (
              <Link href="/caja" className="rounded-full border px-3 py-1.5 font-medium">Caja</Link>
            ) : null}
            {tablero.materialesBajoMinimo !== null ? (
              <Link href="/inventario" className="rounded-full border px-3 py-1.5 font-medium">Inventario</Link>
            ) : null}
          </nav>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores del día">
          <Kpi
            etiqueta="Citas de hoy"
            valor={String(tablero.citasHoy)}
            nota={`${tablero.citasPendientesHoy} vigente${tablero.citasPendientesHoy === 1 ? "" : "s"}`}
          />
          <Kpi etiqueta="Pacientes registrados" valor={String(tablero.pacientesActivos)} />
          {tablero.ingresosHoyCentavos !== null ? (
            <Kpi
              etiqueta="Ingresos de hoy"
              valor={formatearUSD(tablero.ingresosHoyCentavos)}
              nota="Pagos recibidos hoy"
            />
          ) : null}
          {tablero.cuentasPorCobrarCentavos !== null ? (
            <Kpi
              etiqueta="Cuentas por cobrar"
              valor={formatearUSD(tablero.cuentasPorCobrarCentavos)}
              nota="Exigible hoy · las cuotas futuras no cuentan"
              destacado
            />
          ) : null}
        </section>

        {(tablero.vencidoCentavos ?? 0) > 0 ||
        (tablero.procedimientosSinCargo ?? 0) > 0 ||
        (tablero.materialesBajoMinimo ?? 0) > 0 ? (
          <section className="grid gap-4 sm:grid-cols-3" aria-label="Requiere atención">
            {(tablero.vencidoCentavos ?? 0) > 0 ? (
              <Kpi etiqueta="En mora" valor={formatearUSD(tablero.vencidoCentavos!)} nota="Vencido y aún impago" alerta />
            ) : null}
            {(tablero.procedimientosSinCargo ?? 0) > 0 ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Pendientes de cobro</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold">{tablero.procedimientosSinCargo}</p>
                <Link href="/caja" className="mt-1 inline-block text-xs font-medium underline-offset-4 hover:underline">
                  Procedimientos realizados sin cargo →
                </Link>
              </div>
            ) : null}
            {(tablero.materialesBajoMinimo ?? 0) > 0 ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Stock bajo</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold">{tablero.materialesBajoMinimo}</p>
                <Link href="/inventario" className="mt-1 inline-block text-xs font-medium underline-offset-4 hover:underline">
                  Materiales en o bajo el mínimo →
                </Link>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <h2 className="border-b bg-neutral-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-neutral-600">
            Agenda de hoy
          </h2>
          {tablero.citas.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-600">No hay citas agendadas para hoy.</p>
          ) : (
            <ul className="divide-y text-sm">
              {tablero.citas.map((cita) => (
                <li
                  key={cita.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 ${cita.estado === "CANCELADA" ? "text-neutral-400" : ""}`}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="font-mono font-medium">{hora(cita.inicioEn)}–{hora(cita.finEn)}</span>
                    <div className="min-w-0">
                      <Link href={`/pacientes/${cita.paciente.id}`} className={`font-medium underline-offset-4 hover:underline ${cita.estado === "CANCELADA" ? "line-through" : ""}`}>
                        {cita.paciente.nombre}
                      </Link>
                      {cita.motivo ? <p className="truncate text-xs text-neutral-500">{cita.motivo}</p> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-neutral-600">{cita.odontologoNombre}</span>
                    {cita.estado === "CANCELADA" ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium">Cancelada</span>
                    ) : null}
                    <Link href={`/pacientes/${cita.paciente.id}/historial`} className="font-medium text-neutral-900 underline-offset-4 hover:underline">
                      Historial
                    </Link>
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
