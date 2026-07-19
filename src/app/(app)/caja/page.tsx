import Link from "next/link";

import { formatearUSD } from "@/lib/money";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import { listarRealizadosSinCargo } from "@/server/db/caja";
import { buscarPacientes } from "@/server/db/pacientes";

type CajaPageProps = { searchParams: Promise<{ q?: string }> };

function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function CajaPage({ searchParams }: CajaPageProps) {
  const { q } = await searchParams;
  const termino = q?.trim() ?? "";
  const ctx = await requireCtx();
  requirePermiso(ctx, "caja:read");

  const [pendientes, pacientes] = await Promise.all([
    listarRealizadosSinCargo(ctx),
    termino.length >= 2 ? buscarPacientes(ctx, termino) : Promise.resolve([]),
  ]);

  return (
    <main className="min-h-full bg-background p-5 sm:p-8">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">CLIDENT · Caja</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Caja</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            La cuenta por cobrar nace únicamente aquí. Un tratamiento realizado no es deuda
            registrada hasta que una persona de Caja decide crear el cargo.
          </p>
        </header>

        <form className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row" method="get">
          <label htmlFor="q" className="sr-only">Buscar paciente</label>
          <input id="q" name="q" type="search" defaultValue={termino} minLength={2} placeholder="Buscar paciente para ver su estado de cuenta" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
          <button className="rounded-lg border px-4 py-2 text-sm font-medium">Buscar</button>
        </form>

        {pacientes.length > 0 ? (
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <h2 className="border-b bg-muted px-5 py-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pacientes</h2>
            <ul className="divide-y text-sm">
              {pacientes.map((paciente) => (
                <li key={paciente.id}>
                  <Link href={`/caja/${paciente.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-accent">
                    <span className="font-medium">{paciente.apellidos}, {paciente.nombres}</span>
                    <span className="text-muted-foreground">Estado de cuenta →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <header className="border-b bg-muted px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Procedimientos realizados sin cargo
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Lista de trabajo: un humano decide qué se cobra. Los tratamientos con calendario
              de cuotas no aparecen — ya se cobran por cuota.
            </p>
          </header>
          {pendientes.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No hay procedimientos pendientes de cobro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Fecha</th>
                    <th className="px-5 py-3 font-medium">Paciente</th>
                    <th className="px-5 py-3 font-medium">Tratamiento</th>
                    <th className="px-5 py-3 text-right font-medium">Precio aplicado</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pendientes.map((procedimiento) => (
                    <tr key={procedimiento.id}>
                      <td className="whitespace-nowrap px-5 py-3">{fechaCorta(procedimiento.realizadoEn)}</td>
                      <td className="px-5 py-3 font-medium">{procedimiento.pacienteNombre}</td>
                      <td className="px-5 py-3">{procedimiento.tratamientoNombre}</td>
                      <td className="px-5 py-3 text-right font-mono">{formatearUSD(procedimiento.precioAplicadoCentavos)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/caja/${procedimiento.pacienteId}`} className="font-medium text-foreground underline-offset-4 hover:underline">Cobrar</Link>
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
