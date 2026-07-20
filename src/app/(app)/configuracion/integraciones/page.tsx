import { CalendarDays, CheckCircle2, ExternalLink, LockKeyhole } from "lucide-react";

import { desconectarGoogleCalendar } from "@/server/actions/google-calendar";
import { requireCtx } from "@/server/auth/context";
import { getEstadoGoogleCalendar } from "@/server/db/google-calendar";
import { googleCalendarConfigurado } from "@/server/integrations/google-calendar/oauth";

type Props = { searchParams: Promise<{ google?: string | string[] }> };

const MENSAJES: Record<string, string> = {
  conectado: "Google Calendar quedó conectado correctamente.",
  desconectado: "La conexión con Google Calendar fue desactivada.",
  cancelado: "Cancelaste la autorización en Google; no se realizó ningún cambio.",
  error: "No fue posible completar la conexión. Revisá la configuración e intentá nuevamente.",
  "no-configurado": "La integración todavía no tiene credenciales de Google configuradas.",
};

export default async function IntegracionesPage({ searchParams }: Props) {
  const consulta = await searchParams;
  const estado = typeof consulta.google === "string" ? consulta.google : undefined;
  const ctx = await requireCtx();
  const [conexion, configurado] = await Promise.all([
    getEstadoGoogleCalendar(ctx),
    Promise.resolve(googleCalendarConfigurado()),
  ]);
  const activa = Boolean(conexion?.activa);

  return (
    <main className="min-h-full bg-background px-5 py-6 sm:px-8">
      <section className="mx-auto max-w-4xl space-y-6">
        <header className="border-b pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Configuración</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Integraciones</h1>
          <p className="mt-2 text-sm text-muted-foreground">Conectá herramientas de trabajo sin sacar la información clínica de CLIDENT.</p>
        </header>

        {estado && MENSAJES[estado] ? (
          <p role="status" className="rounded-lg border bg-secondary/60 px-4 py-3 text-sm text-secondary-foreground">
            {MENSAJES[estado]}
          </p>
        ) : null}

        <article className="rounded-xl border bg-card">
          <header className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                <CalendarDays className="size-5" aria-hidden="true" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">Google Calendar</h2>
                  {activa ? <span className="rounded-full bg-exito-suave px-2.5 py-0.5 text-xs font-semibold text-exito-texto">Conectado</span> : null}
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Crea un calendario secundario “CLIDENT” en la cuenta laboral del usuario y refleja allí las citas asignadas a ese odontólogo.
                </p>
              </div>
            </div>
            {activa ? (
              <form action={desconectarGoogleCalendar}>
                <button className="rounded-lg border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive">Desconectar</button>
              </form>
            ) : configurado ? (
              <a href="/api/integraciones/google-calendar/conectar" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                Conectar cuenta <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            ) : (
              <span className="rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground">Pendiente de configurar</span>
            )}
          </header>

          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-exito" /> Qué sincroniza</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>• Fecha, hora y duración.</li>
                <li>• Clínica y sede.</li>
                <li>• Reprogramaciones y cancelaciones.</li>
              </ul>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="size-4 text-primary" /> Qué permanece privado</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>• Nombre y datos de contacto del paciente.</li>
                <li>• Diagnósticos y notas clínicas.</li>
                <li>• Tratamientos, odontograma y alertas.</li>
                <li>• Información financiera del paciente.</li>
              </ul>
            </div>
          </div>

          {activa && conexion ? (
            <footer className="border-t bg-muted/50 px-5 py-3 text-sm text-muted-foreground">
              Cuenta conectada: <strong className="text-foreground">{conexion.correoGoogle}</strong> · Calendario: {conexion.calendarioNombre}
            </footer>
          ) : null}
        </article>
      </section>
    </main>
  );
}
