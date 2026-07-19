import Link from "next/link";

import { requireCtx } from "@/server/auth/context";
import { tienePermiso } from "@/server/auth/permissions";
import { buscarPacientes, listarPacientes } from "@/server/db/pacientes";

type PacientesSearchParams = Promise<{ q?: string }>;

export default async function PacientesPage({ searchParams }: { searchParams: PacientesSearchParams }) {
  const parametros = await searchParams;
  const termino = parametros.q?.trim() ?? "";
  const ctx = await requireCtx();
  const pacientes = termino.length >= 2
    ? await buscarPacientes(ctx, termino)
    : await listarPacientes(ctx);
  const puedeCrear = tienePermiso(ctx.roles, "paciente:write");
  const puedeAgendar = tienePermiso(ctx.roles, "agenda:write");

  return (
    <main className="min-h-full bg-background p-5 sm:p-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">CLIDENT · Pacientes</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pacientes y expedientes</h1>
            <p className="mt-1 text-sm text-muted-foreground">Buscá por nombre, teléfono, DUI o teléfono de responsable.</p>
          </div>
          {puedeCrear ? (
            <Link href="/pacientes/nuevo" className="rounded-lg bg-primary transition-colors hover:bg-rosa-hover px-4 py-2 text-center text-sm font-medium text-primary-foreground">
              + Nuevo paciente
            </Link>
          ) : null}
        </header>

        <form className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row" method="get">
          <label htmlFor="q" className="sr-only">Buscar paciente</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={termino}
            minLength={2}
            placeholder="Nombre, teléfono o DUI"
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          <button className="rounded-lg border px-4 py-2 text-sm font-medium">Buscar</button>
          {termino ? <Link href="/pacientes" className="rounded-lg px-4 py-2 text-center text-sm">Limpiar</Link> : null}
        </form>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {pacientes.length === 0 ? (
            <div className="p-10 text-center">
              <h2 className="text-lg font-semibold">No encontramos pacientes</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {termino ? "Probá otro dato de búsqueda o registrá un paciente nuevo." : "Todavía no hay pacientes registrados para esta clínica."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Paciente</th>
                    <th className="px-5 py-3 font-medium">Teléfono</th>
                    <th className="px-5 py-3 font-medium">DUI</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pacientes.map((paciente) => (
                    <tr key={paciente.id}>
                      <td className="px-5 py-4 font-medium text-foreground">{paciente.apellidos}, {paciente.nombres}</td>
                      <td className="px-5 py-4">{paciente.telefono}</td>
                      <td className="px-5 py-4 font-mono text-muted-foreground">{paciente.duiEnmascarado ?? "—"}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-3 whitespace-nowrap">
                          <Link href={`/pacientes/${paciente.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">Expediente</Link>
                          {puedeAgendar ? <Link href={`/agenda/nueva?pacienteId=${encodeURIComponent(paciente.id)}`} className="font-medium text-foreground underline-offset-4 hover:underline">Agendar</Link> : null}
                        </div>
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
