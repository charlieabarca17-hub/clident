import Link from "next/link";
import { notFound } from "next/navigation";

import { formatearUSD, usdEditable } from "@/lib/money";
import {
  actualizarMaterialDesdeFormulario,
  registrarMovimientoDesdeFormulario,
} from "@/server/actions/inventario";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso, tienePermiso } from "@/server/auth/permissions";
import { getMaterialConHistorial } from "@/server/db/inventario";

type MaterialPageProps = {
  params: Promise<{ materialId: string }>;
  searchParams: Promise<{ estado?: string | string[] }>;
};

const ETIQUETA_TIPO: Record<string, { texto: string; clase: string }> = {
  ENTRADA: { texto: "Entrada", clase: "bg-emerald-50 text-emerald-700" },
  SALIDA: { texto: "Salida", clase: "bg-sky-50 text-sky-700" },
  AJUSTE: { texto: "Ajuste", clase: "bg-amber-50 text-amber-800" },
};

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default async function MaterialPage({ params, searchParams }: MaterialPageProps) {
  const [{ materialId }, consulta] = await Promise.all([params, searchParams]);
  const aviso = typeof consulta.estado === "string" ? consulta.estado : undefined;
  const ctx = await requireCtx();
  requirePermiso(ctx, "inventario:read");
  const material = await getMaterialConHistorial(ctx, materialId);
  if (!material) notFound();
  const puedeEscribir = tienePermiso(ctx.roles, "inventario:write");

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <Link href="/inventario" className="text-sm text-neutral-600 underline-offset-4 hover:underline">← Inventario</Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">CLIDENT · Material</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{material.nombre}</h1>
              <p className="mt-1 text-sm text-neutral-600">
                Mínimo: {material.stockMinimo} {material.unidad}
                {material.costoUnitarioCentavos !== null ? ` · Costo unitario: ${formatearUSD(material.costoUnitarioCentavos)}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Stock actual</p>
              <p className={`font-mono text-3xl font-semibold ${material.bajoMinimo ? "text-amber-700" : ""}`}>
                {material.stockActual}
              </p>
              <p className="text-xs text-neutral-500">{material.unidad}</p>
            </div>
          </div>
          {material.bajoMinimo ? (
            <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Este material está en o por debajo del mínimo.
            </p>
          ) : null}
        </header>

        {aviso === "no-disponible" ? (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            El movimiento no se pudo registrar. Si intentabas una salida, revisá que haya stock suficiente.
          </p>
        ) : null}

        {puedeEscribir ? (
          <section className="grid gap-6 lg:grid-cols-2">
            <form action={registrarMovimientoDesdeFormulario} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Registrar movimiento</h2>
              <input type="hidden" name="materialId" value={material.id} />
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">Tipo *
                  <select name="tipo" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                    <option value="ENTRADA">Entrada (compra, devolución)</option>
                    <option value="SALIDA">Salida (consumo)</option>
                    <option value="AJUSTE">Ajuste (conteo físico)</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">Cantidad *
                  <input name="cantidad" type="number" min={1} required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="ajusteNegativo" />
                El ajuste resta (faltante en el conteo)
              </label>
              <label className="block text-sm font-medium">Motivo
                <textarea name="motivo" maxLength={500} rows={2} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                <span className="mt-1 block text-xs font-normal text-neutral-500">Obligatorio en los ajustes: un conteo físico se explica.</span>
              </label>
              <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Registrar movimiento</button>
            </form>

            <form action={actualizarMaterialDesdeFormulario} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Editar material</h2>
              <input type="hidden" name="materialId" value={material.id} />
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">Nombre *
                  <input name="nombre" required maxLength={120} defaultValue={material.nombre} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                </label>
                <label className="block text-sm font-medium">Unidad *
                  <input name="unidad" required maxLength={30} defaultValue={material.unidad} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                </label>
                <label className="block text-sm font-medium">Stock mínimo *
                  <input name="stockMinimo" type="number" min={0} required defaultValue={material.stockMinimo} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                </label>
                <label className="block text-sm font-medium">Costo unitario (USD)
                  <input name="costo" inputMode="decimal" defaultValue={material.costoUnitarioCentavos !== null ? usdEditable(material.costoUnitarioCentavos) : ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="activo" defaultChecked={material.activo} />
                Material activo
              </label>
              <p className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
                El stock no se edita acá: se mueve con entradas, salidas y ajustes para que
                siempre exista el registro de por qué cambió.
              </p>
              <button className="rounded-lg border px-4 py-2 text-sm font-medium">Guardar cambios</button>
            </form>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <h2 className="border-b bg-neutral-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-neutral-600">
            Historial de movimientos
          </h2>
          {material.movimientos.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-600">Sin movimientos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Fecha</th>
                    <th className="px-5 py-3 font-medium">Tipo</th>
                    <th className="px-5 py-3 text-right font-medium">Cantidad</th>
                    <th className="px-5 py-3 text-right font-medium">Saldo después</th>
                    <th className="px-5 py-3 font-medium">Motivo</th>
                    <th className="px-5 py-3 font-medium">Registró</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {material.movimientos.map((movimiento) => {
                    const etiqueta = ETIQUETA_TIPO[movimiento.tipo];
                    return (
                      <tr key={movimiento.id}>
                        <td className="whitespace-nowrap px-5 py-3">{fechaHora(movimiento.creadoEn)}</td>
                        <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${etiqueta.clase}`}>{etiqueta.texto}</span></td>
                        <td className={`px-5 py-3 text-right font-mono ${movimiento.cantidad < 0 ? "text-neutral-700" : "text-emerald-700"}`}>
                          {movimiento.cantidad > 0 ? "+" : ""}{movimiento.cantidad}
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-medium">{movimiento.saldoDespues}</td>
                        <td className="max-w-64 px-5 py-3 text-neutral-600">{movimiento.motivo ?? "—"}</td>
                        <td className="px-5 py-3 text-neutral-600">{movimiento.registradoPorNombre}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
