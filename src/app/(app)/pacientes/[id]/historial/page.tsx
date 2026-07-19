import Link from "next/link";
import { notFound } from "next/navigation";

import { formatearUSD } from "@/lib/money";
import { requireCtx } from "@/server/auth/context";
import { getHistorialPaciente, type TipoEventoHistorial } from "@/server/db/historial";

type HistorialPageProps = { params: Promise<{ id: string }> };

const ESTILO_TIPO: Record<TipoEventoHistorial, { etiqueta: string; punto: string; chip: string }> = {
  CITA: { etiqueta: "Agenda", punto: "bg-neutral-400", chip: "bg-neutral-100 text-neutral-700" },
  DIAGNOSTICO: { etiqueta: "Diagnóstico", punto: "bg-purple-500", chip: "bg-purple-50 text-purple-700" },
  ODONTOGRAMA: { etiqueta: "Odontograma", punto: "bg-sky-500", chip: "bg-sky-50 text-sky-700" },
  PLAN: { etiqueta: "Plan", punto: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700" },
  PROCEDIMIENTO: { etiqueta: "Procedimiento", punto: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  CARGO: { etiqueta: "Cargo", punto: "bg-amber-500", chip: "bg-amber-50 text-amber-800" },
  PAGO: { etiqueta: "Pago", punto: "bg-teal-500", chip: "bg-teal-50 text-teal-700" },
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
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <Link href={`/pacientes/${id}`} className="text-sm text-neutral-600 underline-offset-4 hover:underline">← Expediente</Link>
          <p className="mt-4 text-sm font-medium text-neutral-500">CLIDENT · Historial</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{historial.paciente.nombre}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            El recorrido completo del paciente en orden cronológico. Lo anulado aparece tachado,
            nunca escondido: el expediente conserva lo que pasó y lo que se corrigió.
          </p>
          {!historial.alcance.clinico || !historial.alcance.caja ? (
            <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              Según tu rol, este historial muestra{" "}
              {[historial.alcance.clinico ? "información clínica" : null, historial.alcance.caja ? "movimientos de caja" : null]
                .filter(Boolean)
                .join(" y ") || "solo la agenda"}.
            </p>
          ) : null}
        </header>

        {historial.eventos.length === 0 ? (
          <p className="rounded-2xl border bg-white p-8 text-center text-sm text-neutral-600 shadow-sm">
            Este paciente todavía no tiene historia registrada.
          </p>
        ) : (
          [...porDia.entries()].map(([dia, eventos]) => (
            <section key={dia} className="space-y-3">
              <h2 className="text-sm font-semibold capitalize text-neutral-700">
                {fechaLarga(eventos[0].ocurridoEn)}
              </h2>
              <ol className="space-y-2 border-l-2 border-neutral-200 pl-5">
                {eventos.map((evento) => {
                  const estilo = ESTILO_TIPO[evento.tipo];
                  return (
                    <li key={evento.id} className="relative">
                      <span
                        className={`absolute -left-[27px] top-3 h-3 w-3 rounded-full ring-2 ring-neutral-50 ${estilo.punto} ${evento.anulado ? "opacity-40" : ""}`}
                        aria-hidden
                      />
                      <article className={`rounded-xl border bg-white p-4 shadow-sm ${evento.anulado ? "opacity-70" : ""}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${estilo.chip}`}>
                                {estilo.etiqueta}
                              </span>
                              <span className="font-mono text-xs text-neutral-500">{hora(evento.ocurridoEn)}</span>
                              {evento.anulado ? (
                                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">Anulado</span>
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
                              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{evento.detalle}</p>
                            ) : null}
                            {evento.autor ? (
                              <p className="mt-1 text-xs text-neutral-500">{evento.autor}</p>
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
