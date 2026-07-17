import Link from "next/link";

import { cancelarCitaDesdeFormulario } from "@/server/actions/citas";
import { requireCtx } from "@/server/auth/context";
import { tienePermiso } from "@/server/auth/permissions";
import { FechaCivilSchema, fechaHoyElSalvador } from "@/lib/validation/citas";
import { listarCitasDia, listarOdontologosAgenda } from "@/server/db/citas";

type AgendaSearchParams = Promise<{ fecha?: string; odontologoId?: string }>;

function moverDia(fecha: string, dias: number): string {
  const valor = new Date(`${fecha}T00:00:00-06:00`);
  valor.setUTCDate(valor.getUTCDate() + dias);
  return valor.toISOString().slice(0, 10);
}

function etiquetaFecha(fecha: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${fecha}T00:00:00-06:00`));
}

export default async function AgendaPage({ searchParams }: { searchParams: AgendaSearchParams }) {
  const parametros = await searchParams;
  const fecha = FechaCivilSchema.safeParse(parametros.fecha).success
    ? parametros.fecha!
    : fechaHoyElSalvador();
  const odontologoId = parametros.odontologoId?.trim() || undefined;
  const ctx = await requireCtx();
  const [citas, odontologos] = await Promise.all([
    listarCitasDia(ctx, fecha, odontologoId),
    listarOdontologosAgenda(ctx),
  ]);
  const puedeEscribir = tienePermiso(ctx.roles, "agenda:write");
  const ruta = (otraFecha: string) => `/agenda?fecha=${otraFecha}${odontologoId ? `&odontologoId=${odontologoId}` : ""}`;

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-500">CLIDENT · Agenda</p>
            <h1 className="mt-1 text-2xl font-semibold capitalize tracking-tight">{etiquetaFecha(fecha)}</h1>
            <p className="mt-1 text-sm text-neutral-600">Agenda diaria por odontólogo. La base impide reservas cruzadas o simultáneas.</p>
          </div>
          {puedeEscribir ? (
            <Link
              href={`/agenda/nueva?fecha=${fecha}`}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-center text-sm font-medium text-white"
            >
              + Nueva cita
            </Link>
          ) : null}
        </header>

        <section className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <nav className="flex items-center gap-2" aria-label="Cambiar día">
            <Link href={ruta(moverDia(fecha, -1))} className="rounded-lg border px-3 py-2 text-sm">← Anterior</Link>
            <Link href={ruta(fechaHoyElSalvador())} className="rounded-lg border px-3 py-2 text-sm">Hoy</Link>
            <Link href={ruta(moverDia(fecha, 1))} className="rounded-lg border px-3 py-2 text-sm">Siguiente →</Link>
          </nav>
          <form className="flex flex-col gap-2 sm:flex-row" method="get">
            <input type="date" name="fecha" defaultValue={fecha} className="rounded-lg border px-3 py-2 text-sm" />
            <select name="odontologoId" defaultValue={odontologoId ?? ""} className="rounded-lg border px-3 py-2 text-sm">
              <option value="">Todos los odontólogos</option>
              {odontologos.map((odontologo) => (
                <option key={odontologo.id} value={odontologo.id}>{odontologo.nombre}</option>
              ))}
            </select>
            <button className="rounded-lg border px-3 py-2 text-sm font-medium">Ver agenda</button>
          </form>
        </section>

        {odontologos.length > 0 ? (
          <aside className="flex flex-wrap gap-3 text-sm text-neutral-700" aria-label="Odontólogos disponibles">
            {odontologos.map((odontologo) => (
              <span key={odontologo.id} className="inline-flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ backgroundColor: odontologo.colorAgenda ?? "#737373" }} />
                {odontologo.nombre}
              </span>
            ))}
          </aside>
        ) : null}

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          {citas.length === 0 ? (
            <div className="p-10 text-center">
              <h2 className="text-lg font-semibold">No hay citas para este día</h2>
              <p className="mt-2 text-sm text-neutral-600">Podés elegir otro odontólogo, cambiar la fecha o crear una cita nueva.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Hora</th>
                    <th className="px-5 py-3 font-medium">Paciente</th>
                    <th className="px-5 py-3 font-medium">Odontólogo</th>
                    <th className="px-5 py-3 font-medium">Motivo</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {citas.map((cita) => (
                    <tr key={cita.id} className={cita.estado === "CANCELADA" ? "bg-neutral-50 text-neutral-500" : ""}>
                      <td className="whitespace-nowrap px-5 py-4 font-medium">{cita.horaInicio}–{cita.horaFin}</td>
                      <td className="px-5 py-4">{cita.paciente.nombreCompleto}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: cita.odontologo.colorAgenda ?? "#737373" }} />
                          {cita.odontologo.nombre}
                        </span>
                      </td>
                      <td className="max-w-64 px-5 py-4">{cita.motivo ?? "—"}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium">{cita.estado}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {puedeEscribir && cita.estado === "PENDIENTE" ? (
                          <form action={cancelarCitaDesdeFormulario}>
                            <input type="hidden" name="citaId" value={cita.id} />
                            <input type="hidden" name="fecha" value={fecha} />
                            <button className="text-sm font-medium text-red-700">Cancelar</button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
