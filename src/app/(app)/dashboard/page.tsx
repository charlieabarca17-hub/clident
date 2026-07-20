import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  PackageSearch,
  Users,
  WalletCards,
} from "lucide-react";

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

function Indicador({ etiqueta, valor, icono: Icono }: { etiqueta: string; valor: string; icono: typeof CalendarDays }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3 first:pl-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icono className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{etiqueta}</p>
        <p className="mt-0.5 font-mono text-lg font-semibold leading-none">{valor}</p>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const ctx = await requireCtx();
  const tablero = await getDashboard(ctx);
  const rolPrincipal = ctx.roles.includes("ODONTOLOGO")
    ? "Jornada clínica"
    : ctx.roles.includes("RECEPCION")
      ? "Control de recepción"
      : ctx.roles.includes("CAJA")
        ? "Operación de caja"
        : "Operación de la clínica";
  const alertas = [
    (tablero.vencidoCentavos ?? 0) > 0 ? { etiqueta: "Saldo vencido", valor: formatearUSD(tablero.vencidoCentavos!), href: "/caja", icono: WalletCards } : null,
    (tablero.tratamientosSinCargo ?? 0) > 0 ? { etiqueta: "Tratamientos pendientes de cobro", valor: String(tablero.tratamientosSinCargo), href: "/caja", icono: WalletCards } : null,
    (tablero.materialesBajoMinimo ?? 0) > 0 ? { etiqueta: "Materiales bajo mínimo", valor: String(tablero.materialesBajoMinimo), href: "/inventario", icono: PackageSearch } : null,
  ].filter((alerta): alerta is NonNullable<typeof alerta> => alerta !== null);

  return (
    <main className="min-h-full bg-background px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rolPrincipal}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight capitalize">{fechaLarga(tablero.hoy)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Lo importante para comenzar y cerrar bien la jornada.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/agenda" className="rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent">Ver agenda completa</Link>
            <Link href="/pacientes" className="rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent">Buscar paciente</Link>
          </div>
        </header>

        <section className="grid divide-y border-b sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4" aria-label="Resumen de la jornada">
          <Indicador etiqueta="Citas de hoy" valor={String(tablero.citasHoy)} icono={CalendarDays} />
          <Indicador etiqueta="Citas vigentes" valor={String(tablero.citasPendientesHoy)} icono={Clock3} />
          <Indicador etiqueta="Pacientes registrados" valor={String(tablero.pacientesActivos)} icono={Users} />
          {tablero.ingresosHoyCentavos !== null ? (
            <Indicador etiqueta="Pagos recibidos hoy" valor={formatearUSD(tablero.ingresosHoyCentavos)} icono={WalletCards} />
          ) : (
            <Indicador etiqueta="Operación" valor="Al día" icono={CheckCircle2} />
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.65fr)]">
          <section className="min-w-0 overflow-hidden rounded-xl border bg-card">
            <header className="flex items-center justify-between gap-4 border-b px-5 py-4">
              <div>
                <h2 className="font-semibold">Agenda de hoy</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Ordenada por hora y profesional.</p>
              </div>
              <Link href="/agenda/nueva" className="text-sm font-semibold underline-offset-4 hover:underline">+ Nueva cita</Link>
            </header>
            {tablero.citas.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
                <h3 className="mt-4 font-semibold">No hay citas programadas</h3>
                <p className="mt-1 text-sm text-muted-foreground">La jornada está libre por ahora.</p>
              </div>
            ) : (
              <ol className="divide-y">
                {tablero.citas.map((cita, indice) => (
                  <li key={cita.id} className={`grid gap-3 px-5 py-4 sm:grid-cols-[92px_minmax(0,1fr)_180px_auto] sm:items-center ${cita.estado === "CANCELADA" ? "bg-muted/50 text-muted-foreground" : ""}`}>
                    <div>
                      <p className="font-mono text-sm font-semibold">{hora(cita.inicioEn)}</p>
                      <p className="font-mono text-xs text-muted-foreground">{hora(cita.finEn)}</p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`size-2 rounded-full ${cita.estado === "CANCELADA" ? "bg-muted-foreground" : indice === 0 ? "bg-exito" : "bg-cielo"}`} />
                        <Link href={`/pacientes/${cita.paciente.id}`} className={`truncate font-semibold underline-offset-4 hover:underline ${cita.estado === "CANCELADA" ? "line-through" : ""}`}>
                          {cita.paciente.nombre}
                        </Link>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{cita.motivo ?? "Consulta odontológica"}</p>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{cita.odontologoNombre}</p>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className={cita.estado === "CANCELADA" ? "rounded-full bg-muted px-2.5 py-1 text-xs font-medium" : "rounded-full bg-exito-suave px-2.5 py-1 text-xs font-medium text-exito-texto"}>
                        {cita.estado === "CANCELADA" ? "Cancelada" : "Programada"}
                      </span>
                      <Link href={`/pacientes/${cita.paciente.id}`} aria-label={`Abrir expediente de ${cita.paciente.nombre}`}><ArrowRight className="size-4" /></Link>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <aside className="space-y-5">
            <section className="rounded-xl border bg-card">
              <header className="border-b px-5 py-4">
                <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-advertencia" aria-hidden="true" /><h2 className="font-semibold">Requiere atención</h2></div>
                <p className="mt-1 text-sm text-muted-foreground">Pendientes según tus permisos.</p>
              </header>
              {alertas.length === 0 ? (
                <div className="flex gap-3 p-5 text-sm">
                  <CheckCircle2 className="size-5 shrink-0 text-exito" aria-hidden="true" />
                  <div><p className="font-semibold">Sin pendientes críticos</p><p className="mt-1 text-muted-foreground">Caja e inventario no reportan alertas para tu rol.</p></div>
                </div>
              ) : (
                <ul className="divide-y">
                  {alertas.map((alerta) => {
                    const Icono = alerta.icono;
                    return <li key={alerta.etiqueta}><Link href={alerta.href} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted"><Icono className="size-4 text-advertencia" /><span className="min-w-0 flex-1 text-sm font-medium">{alerta.etiqueta}</span><span className="font-mono text-sm font-semibold">{alerta.valor}</span></Link></li>;
                  })}
                </ul>
              )}
            </section>

            {tablero.cuentasPorCobrarCentavos !== null ? (
              <section className="rounded-xl bg-primary p-5 text-primary-foreground">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">Exigible hoy</p>
                <p className="mt-2 font-mono text-3xl font-semibold">{formatearUSD(tablero.cuentasPorCobrarCentavos)}</p>
                <p className="mt-2 text-sm opacity-75">Las cuotas futuras no están incluidas.</p>
                <Link href="/caja" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">Abrir Caja <ArrowRight className="size-4" /></Link>
              </section>
            ) : null}

            <section className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Continuidad clínica</h2>
              <p className="mt-2 text-sm text-muted-foreground">Los próximos indicadores incorporarán planes sin programar, seguimientos y notas clínicas pendientes.</p>
              <Link href="/pacientes" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">Revisar pacientes <ArrowRight className="size-4" /></Link>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
