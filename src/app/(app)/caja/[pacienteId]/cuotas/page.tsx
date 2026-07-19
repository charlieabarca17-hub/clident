import Link from "next/link";
import { notFound } from "next/navigation";

import { generarFechasCuotasMensuales } from "@/lib/fechas";
import { centavosDesdeTexto, formatearUSD } from "@/lib/money";
import { confirmarCalendarioCuotas } from "@/server/actions/caja";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import { getEstadoCuenta } from "@/server/db/caja";

type CuotasPageProps = {
  params: Promise<{ pacienteId: string }>;
  searchParams: Promise<{ planItemId?: string; n?: string; monto?: string; inicio?: string }>;
};

function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${fecha}T12:00:00Z`));
}

/**
 * Pantalla de confirmación del calendario (ADR-016 #19): el usuario VE todas
 * las fechas generadas antes de confirmar. Una fecha en el año equivocado se
 * nota acá, no dieciocho meses después en un reporte que nunca la muestra.
 */
export default async function ConfirmarCuotasPage({ params, searchParams }: CuotasPageProps) {
  const [{ pacienteId }, consulta] = await Promise.all([params, searchParams]);
  const ctx = await requireCtx();
  requirePermiso(ctx, "caja:write");

  const cuenta = await getEstadoCuenta(ctx, pacienteId);
  if (!cuenta) notFound();

  const planItemId = consulta.planItemId?.trim() ?? "";
  const cantidad = Number(consulta.n ?? 0);
  const montoCentavos = centavosDesdeTexto(consulta.monto ?? "");
  const inicio = consulta.inicio?.trim() ?? "";
  const parametrosValidos =
    planItemId && Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= 120 &&
    montoCentavos !== null && montoCentavos > 0 && /^\d{4}-\d{2}-\d{2}$/.test(inicio);

  const fechas = parametrosValidos ? generarFechasCuotasMensuales(inicio, cantidad) : [];

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <Link href={`/caja/${pacienteId}`} className="text-sm text-neutral-600 underline-offset-4 hover:underline">← Estado de cuenta</Link>
          <p className="mt-4 text-sm font-medium text-neutral-500">CLIDENT · Calendario de cuotas</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {cuenta.paciente.nombres} {cuenta.paciente.apellidos}
          </h1>
        </header>

        {!parametrosValidos ? (
          <p className="rounded-2xl border bg-white p-8 text-center text-sm text-neutral-600 shadow-sm">
            Los parámetros del calendario no son válidos. Volvé al estado de cuenta e intentá de nuevo.
          </p>
        ) : (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">
              {cantidad} cuota{cantidad === 1 ? "" : "s"} de {formatearUSD(montoCentavos!)}
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Revisá cada fecha antes de confirmar. Solo la primera cuota vencida o de hoy entra
              al «debe hoy»; las demás son futuras hasta que les llegue el día.
            </p>
            <ol className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
              {fechas.map((fecha, indice) => (
                <li key={fecha} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-neutral-600">Cuota {indice + 1}</span>
                  <span className="font-medium">{fechaLarga(fecha)}</span>
                </li>
              ))}
            </ol>
            <form action={confirmarCalendarioCuotas} className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
              <input type="hidden" name="pacienteId" value={pacienteId} />
              <input type="hidden" name="planItemId" value={planItemId} />
              <input type="hidden" name="montoCuota" value={consulta.monto ?? ""} />
              {fechas.map((fecha) => (
                <input key={fecha} type="hidden" name="fechas" value={fecha} />
              ))}
              <p className="text-sm text-neutral-600">
                Total del calendario: <strong className="font-mono">{formatearUSD(montoCentavos! * cantidad)}</strong>
              </p>
              <button className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white">
                Confirmar y crear las {cantidad} cuotas
              </button>
            </form>
          </section>
        )}
      </section>
    </main>
  );
}
