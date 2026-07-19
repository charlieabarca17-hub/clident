import Link from "next/link";
import { notFound } from "next/navigation";

import { formatearUSD } from "@/lib/money";
import { requireCtx } from "@/server/auth/context";
import { getHistorialPaciente, type TipoEventoHistorial } from "@/server/db/historial";

type HistorialPageProps = { params: Promise<{ id: string }> };

/**
 * Colores de la línea de tiempo. Sólo tonos de la paleta CLIDENT: nada de
 * violeta, celeste ni turquesa de Tailwind, que al lado del rosa se ven de
 * otro sistema.
 *
 * `PROCEDIMIENTO` y `PAGO` llevan colores DISTINTOS a propósito. Es el mismo
 * principio que CLAUDE.md §6 defiende en el modelo de datos: realizado no es
 * cobrado. Pintarlos igual sería conflactar visualmente justo las dos cosas
 * que toda la arquitectura existe para mantener separadas.
 *
 * El color nunca es el único portador de sentido: cada evento lleva además su
 * etiqueta en texto ("Diagnóstico", "Cargo"), así que un usuario daltónico lee
 * lo mismo que cualquiera.
 */
const ESTILO_TIPO: Record<TipoEventoHistorial, { etiqueta: string; punto: string; chip: string }> = {
  CITA: { etiqueta: "Agenda", punto: "bg-muted-foreground", chip: "bg-muted text-foreground" },
  DIAGNOSTICO: { etiqueta: "Diagnóstico", punto: "bg-rosa-hover", chip: "bg-secondary text-secondary-foreground" },
  ODONTOGRAMA: { etiqueta: "Odontograma", punto: "bg-rosa", chip: "bg-secondary text-secondary-foreground" },
  // Punto HUECO y chip de contorno: un plan es intención, no un hecho. Se
  // distingue de la cita (§6: programación no es progreso clínico) por forma
  // además de por color, que es lo que sigue funcionando en escala de grises.
  PLAN: { etiqueta: "Plan", punto: "border-2 border-rosa bg-card", chip: "border border-rosa bg-card text-ciruela" },
  PROCEDIMIENTO: { etiqueta: "Procedimiento", punto: "bg-ciruela", chip: "bg-ciruela text-white" },
  CARGO: { etiqueta: "Cargo", punto: "bg-advertencia", chip: "bg-advertencia-suave text-foreground" },
  PAGO: { etiqueta: "Pago", punto: "bg-exito", chip: "bg-exito-suave text-exito-texto" },
};

function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function hora(iso: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function diaCivil(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export default async function HistorialPage({ params }: HistorialPageProps) {
  const { id } = await params;
  const ctx = await requireCtx();
  const historial = await getHistorialPaciente(ctx, id);
  if (!historial) notFound();

  // Agrupado por día civil salvadoreño: la historia se lee por jornadas.
  const porDia = new Map<string, typeof historial.eventos>();
  for (const evento of historial.eventos) {
    const dia = diaCivil(evento.ocurridoEn);
    const grupo = porDia.get(dia) ?? [];
    grupo.push(evento);
    porDia.set(dia, grupo);
  }

  return (
    <main className="min-h-full bg-background p-5 sm:p-8">
      <section className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl border bg-card p-5 shadow-sm">
          <Link href={`/pacientes/${id}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Expediente</Link>
          <p className="mt-4 text-sm font-medium text-muted-foreground">CLIDENT · Historial</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{historial.paciente.nombre}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            El recorrido completo del paciente en orden cronológico. Lo anulado aparece tachado,
            nunca escondido: el expediente conserva lo que pasó y lo que se corrigió.
          </p>
          {!historial.alcance.clinico || !historial.alcance.caja ? (
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Según tu rol, este historial muestra{" "}
              {[historial.alcance.clinico ? "información clínica" : null, historial.alcance.caja ? "movimientos de caja" : null]
                .filter(Boolean)
                .join(" y ") || "solo la agenda"}.
            </p>
          ) : null}
        </header>

        {historial.eventos.length === 0 ? (
          <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
            Este paciente todavía no tiene historia registrada.
          </p>
        ) : (
          [...porDia.entries()].map(([dia, eventos]) => (
            <section key={dia} className="space-y-3">
              <h2 className="text-sm font-semibold capitalize text-foreground">
                {fechaLarga(eventos[0].ocurridoEn)}
              </h2>
              <ol className="space-y-2 border-l-2 border-border pl-5">
                {eventos.map((evento) => {
                  const estilo = ESTILO_TIPO[evento.tipo];
                  return (
                    <li key={evento.id} className="relative">
                      <span
                        className={`absolute -left-[27px] top-3 h-3 w-3 rounded-full ring-2 ring-background ${estilo.punto} ${evento.anulado ? "opacity-40" : ""}`}
                        aria-hidden
                      />
                      <article className={`rounded-xl border bg-card p-4 shadow-sm ${evento.anulado ? "opacity-70" : ""}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${estilo.chip}`}>
                                {estilo.etiqueta}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">{hora(evento.ocurridoEn)}</span>
                              {evento.anulado ? (
                                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Anulado</span>
                              ) : null}
                            </div>
                            <p className={`mt-1.5 font-medium ${evento.anulado ? "line-through" : ""}`}>
                              {evento.enlace ? (
                                <Link href={evento.enlace} className="underline-offset-4 hover:underline">{evento.titulo}</Link>
                              ) : (
                                evento.titulo
                              )}
                            </p>
                            {evento.detalle ? (
                              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{evento.detalle}</p>
                            ) : null}
                            {evento.autor ? (
                              <p className="mt-1 text-xs text-muted-foreground">{evento.autor}</p>
                            ) : null}
                          </div>
                          {evento.montoCentavos !== null ? (
                            <p className="whitespace-nowrap font-mono text-sm font-semibold">
                              {formatearUSD(evento.montoCentavos)}
                            </p>
                          ) : null}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
      </section>
    </main>
  );
}
