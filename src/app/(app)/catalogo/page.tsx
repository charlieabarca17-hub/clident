import Link from "next/link";

import { formatearUSD } from "@/lib/money";
import { clonarCatalogoInicial } from "@/server/actions/catalogo";
import { requireCtx } from "@/server/auth/context";
import { tienePermiso } from "@/server/auth/permissions";
import { listarCatalogo } from "@/server/db/catalogo";

const ETIQUETA_ALCANCE = { DIENTE: "Por pieza", BOCA: "Boca completa" } as const;

export default async function CatalogoPage() {
  const ctx = await requireCtx();
  const categorias = await listarCatalogo(ctx);
  const puedeEscribir = tienePermiso(ctx.roles, "catalogo:write");
  const catalogoVacio = categorias.length === 0;

  return (
    <main className="min-h-full bg-background p-5 sm:p-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">CLIDENT · Catálogo</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Catálogo de tratamientos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              La lista de precios de la clínica. Cambiar un precio aquí nunca modifica planes ya creados.
            </p>
          </div>
          {puedeEscribir && !catalogoVacio ? (
            <Link href="/catalogo/nuevo" className="rounded-lg bg-primary transition-colors hover:bg-rosa-hover px-4 py-2 text-center text-sm font-medium text-primary-foreground">
              + Nuevo tratamiento
            </Link>
          ) : null}
        </header>

        {catalogoVacio ? (
          <section className="rounded-2xl border bg-card p-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold">El catálogo está vacío</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              CLIDENT trae un catálogo inicial de 12 categorías y más de 90 tratamientos con precios
              sugeridos. Se copia una sola vez y desde ahí es completamente tuyo: podés renombrar,
              cambiar precios y desactivar lo que tu clínica no ofrezca.
            </p>
            {puedeEscribir ? (
              <form action={clonarCatalogoInicial} className="mt-6">
                <button className="rounded-lg bg-primary transition-colors hover:bg-rosa-hover px-5 py-2.5 text-sm font-medium text-primary-foreground">
                  Copiar catálogo inicial
                </button>
              </form>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                Pedile a una persona administradora que lo inicialice.
              </p>
            )}
          </section>
        ) : (
          categorias.map((categoria) => (
            <section key={categoria.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <h2 className="border-b bg-muted px-5 py-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {categoria.nombre}
              </h2>
              {categoria.tratamientos.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">Sin tratamientos en esta categoría.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 font-medium">Código</th>
                        <th className="px-5 py-3 font-medium">Tratamiento</th>
                        <th className="px-5 py-3 font-medium">Alcance</th>
                        <th className="px-5 py-3 text-right font-medium">Precio de lista</th>
                        <th className="px-5 py-3 font-medium">Estado</th>
                        {puedeEscribir ? <th className="px-5 py-3 font-medium" /> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {categoria.tratamientos.map((tratamiento) => (
                        <tr key={tratamiento.id} className={tratamiento.activo ? "" : "text-muted-foreground/70"}>
                          <td className="px-5 py-3 font-mono">{tratamiento.codigo}</td>
                          <td className="px-5 py-3 font-medium">{tratamiento.nombre}</td>
                          <td className="px-5 py-3">{ETIQUETA_ALCANCE[tratamiento.alcance]}</td>
                          <td className="px-5 py-3 text-right font-mono">
                            {formatearUSD(tratamiento.precioListaCentavos)}
                          </td>
                          <td className="px-5 py-3">
                            {tratamiento.activo ? (
                              <span className="rounded-full bg-exito-suave px-2.5 py-0.5 text-xs font-medium text-exito-texto">Activo</span>
                            ) : (
                              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Inactivo</span>
                            )}
                          </td>
                          {puedeEscribir ? (
                            <td className="px-5 py-3 text-right">
                              <Link
                                href={`/catalogo/${tratamiento.id}/editar`}
                                className="font-medium text-foreground underline-offset-4 hover:underline"
                              >
                                Editar
                              </Link>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))
        )}
      </section>
    </main>
  );
}
