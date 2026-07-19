import Link from "next/link";

import { formatearUSD } from "@/lib/money";
import { crearMaterialDesdeFormulario } from "@/server/actions/inventario";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso, tienePermiso } from "@/server/auth/permissions";
import { listarMateriales } from "@/server/db/inventario";

type InventarioPageProps = { searchParams: Promise<{ estado?: string | string[] }> };

export default async function InventarioPage({ searchParams }: InventarioPageProps) {
  const consulta = await searchParams;
  const aviso = typeof consulta.estado === "string" ? consulta.estado : undefined;
  const ctx = await requireCtx();
  requirePermiso(ctx, "inventario:read");
  const materiales = await listarMateriales(ctx);
  const puedeEscribir = tienePermiso(ctx.roles, "inventario:write");
  const enAlerta = materiales.filter((material) => material.bajoMinimo);

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">CLIDENT · Inventario</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Materiales</h1>
          <p className="mt-1 text-sm text-neutral-600">
            El stock se mueve con entradas, salidas y ajustes — cada uno deja historia. No se
            edita a mano y nunca puede quedar negativo.
          </p>
        </header>

        {aviso === "no-disponible" ? (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            La operación no se pudo completar. Recargá la página y volvé a intentarlo.
          </p>
        ) : null}

        {enAlerta.length > 0 ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm" role="alert">
            <h2 className="font-semibold text-amber-900">
              {enAlerta.length} material{enAlerta.length === 1 ? "" : "es"} en o por debajo del mínimo
            </h2>
            <ul className="mt-2 flex flex-wrap gap-2 text-sm">
              {enAlerta.map((material) => (
                <li key={material.id}>
                  <Link href={`/inventario/${material.id}`} className="rounded-full border border-amber-300 bg-white px-3 py-1 font-medium underline-offset-4 hover:underline">
                    {material.nombre}: {material.stockActual} {material.unidad}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <h2 className="border-b bg-neutral-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-neutral-600">
            Materiales registrados
          </h2>
          {materiales.length === 0 ? (
            <div className="p-10 text-center">
              <h3 className="text-lg font-semibold">No hay materiales registrados</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
                Registrá los insumos que la clínica controla —resinas, anestesia, guantes— con su
                stock actual y el mínimo que dispara la alerta.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Material</th>
                    <th className="px-5 py-3 text-right font-medium">Stock</th>
                    <th className="px-5 py-3 text-right font-medium">Mínimo</th>
                    <th className="px-5 py-3 text-right font-medium">Costo unitario</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {materiales.map((material) => (
                    <tr key={material.id} className={material.activo ? "" : "text-neutral-400"}>
                      <td className="px-5 py-3 font-medium">{material.nombre}</td>
                      <td className={`px-5 py-3 text-right font-mono ${material.bajoMinimo ? "font-semibold text-amber-700" : ""}`}>
                        {material.stockActual} {material.unidad}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-neutral-500">{material.stockMinimo}</td>
                      <td className="px-5 py-3 text-right font-mono">
                        {material.costoUnitarioCentavos === null ? "—" : formatearUSD(material.costoUnitarioCentavos)}
                      </td>
                      <td className="px-5 py-3">
                        {!material.activo ? (
                          <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500">Inactivo</span>
                        ) : material.bajoMinimo ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Bajo mínimo</span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Disponible</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/inventario/${material.id}`} className="font-medium text-neutral-900 underline-offset-4 hover:underline">
                          Movimientos
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {puedeEscribir ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Nuevo material</h2>
            <form action={crearMaterialDesdeFormulario} className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Nombre *
                <input name="nombre" required maxLength={120} placeholder="Resina compuesta A2" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-medium">Unidad *
                <input name="unidad" required maxLength={30} placeholder="jeringa, caja, unidad" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-medium">Stock inicial *
                <input name="stockActual" type="number" min={0} required defaultValue={0} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-medium">Stock mínimo *
                <input name="stockMinimo" type="number" min={0} required defaultValue={0} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
                <span className="mt-1 block text-xs font-normal text-neutral-500">La alerta salta cuando el stock llega a este número.</span>
              </label>
              <label className="block text-sm font-medium">Costo unitario (USD)
                <input name="costo" inputMode="decimal" placeholder="Opcional" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <div className="flex items-end justify-end sm:col-span-2">
                <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Registrar material</button>
              </div>
            </form>
          </section>
        ) : null}
      </section>
    </main>
  );
}
