import Link from "next/link";
import { notFound } from "next/navigation";

import { formatearUSD } from "@/lib/money";
import { crearPlanDesdeFormulario } from "@/server/actions/planes";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso, tienePermiso } from "@/server/auth/permissions";
import { getPacienteAdministrativo } from "@/server/db/pacientes";
import { listarPlanes } from "@/server/db/planes";

type PlanesPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estado?: string | string[] }>;
};

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  BORRADOR: { texto: "Borrador", clase: "bg-muted text-foreground" },
  PRESENTADO: { texto: "Presentado", clase: "bg-secondary text-secondary-foreground" },
  ACEPTADO: { texto: "Aceptado", clase: "bg-exito-suave text-exito-texto" },
  RECHAZADO: { texto: "Rechazado", clase: "bg-advertencia-suave text-foreground" },
  ANULADO: { texto: "Anulado", clase: "bg-destructive/10 text-destructive" },
};

function fecha(iso: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function PlanesPage({ params, searchParams }: PlanesPageProps) {
  const [{ id }, consulta] = await Promise.all([params, searchParams]);
  const aviso = typeof consulta.estado === "string" ? consulta.estado : undefined;
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:read");
  const paciente = await getPacienteAdministrativo(ctx, id);
  if (!paciente) notFound();

  const planes = await listarPlanes(ctx, id);
  const puedeEscribir = tienePermiso(ctx.roles, "clinico:write");

  return (
    <main className="min-h-full bg-background p-5 sm:p-8">
      <section className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl border bg-card p-5 shadow-sm">
          <Link href={`/pacientes/${paciente.id}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Expediente</Link>
          <p className="mt-4 text-sm font-medium text-muted-foreground">CLIDENT · Planes de tratamiento</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{paciente.nombres} {paciente.apellidos}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Un plan es un presupuesto con precios congelados al día en que se armó. Aceptarlo no
            genera ningún cobro: la cuenta por cobrar se registra únicamente en Caja.
          </p>
        </header>

        {aviso === "no-disponible" ? (
          <p role="alert" className="rounded-lg border border-advertencia/40 bg-advertencia-suave px-3 py-2 text-sm text-foreground">
            La operación no se pudo completar. Recargá la página y volvé a intentarlo.
          </p>
        ) : null}

        {puedeEscribir ? (
          <form action={crearPlanDesdeFormulario} className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-end">
            <input type="hidden" name="pacienteId" value={paciente.id} />
            <label className="block flex-1 text-sm font-medium">Nuevo plan de tratamiento
              <input name="titulo" maxLength={160} placeholder="Ej.: Rehabilitación cuadrante superior derecho" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <button className="rounded-lg bg-primary transition-colors hover:bg-rosa-hover px-4 py-2 text-sm font-medium text-primary-foreground">Crear borrador</button>
          </form>
        ) : null}

        <section className="space-y-3">
          {planes.length === 0 ? (
            <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
              Este paciente todavía no tiene planes de tratamiento.
            </p>
          ) : (
            planes.map((plan) => {
              const etiqueta = ETIQUETA_ESTADO[plan.estado];
              const total = plan.items
                .filter((item) => item.estado !== "CANCELADO" && item.estado !== "ANULADO")
                .reduce((suma, item) => suma + item.precioFinalCentavos, 0);
              return (
                <Link
                  key={plan.id}
                  href={`/pacientes/${paciente.id}/planes/${plan.id}`}
                  className="block rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-rosa"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{plan.titulo ?? "Plan de tratamiento"}</h2>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${etiqueta.clase}`}>{etiqueta.texto}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {plan.items.length} tratamiento{plan.items.length === 1 ? "" : "s"} · Creado {fecha(plan.creadoEn)} por {plan.creadoPorNombre}
                      </p>
                    </div>
                    <p className="font-mono text-lg font-semibold">{formatearUSD(total)}</p>
                  </div>
                </Link>
              );
            })
          )}
        </section>
      </section>
    </main>
  );
}
