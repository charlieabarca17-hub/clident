import Link from "next/link";
import { BookOpen, Plus, Search, Star } from "lucide-react";

import { agregarReferenciaDesdeFormulario } from "@/server/actions/catalogo";
import { requireCtx } from "@/server/auth/context";
import { tienePermiso } from "@/server/auth/permissions";
import { listarCatalogo, listarReferenciasCatalogo } from "@/server/db/catalogo";

const ETIQUETA_ALCANCE = { DIENTE: "Por pieza", BOCA: "Boca completa" } as const;

type CatalogoPageProps = { searchParams: Promise<{ q?: string | string[] }> };

export default async function CatalogoPage({ searchParams }: CatalogoPageProps) {
  const consulta = await searchParams;
  const termino = typeof consulta.q === "string" ? consulta.q.trim() : "";
  const ctx = await requireCtx();
  const puedeEscribir = tienePermiso(ctx.roles, "catalogo:write");
  const [categorias, referencias] = await Promise.all([
    listarCatalogo(ctx),
    listarReferenciasCatalogo(ctx, termino),
  ]);
  const total = categorias.reduce((suma, categoria) => suma + categoria.tratamientos.length, 0);

  return (
    <main className="min-h-full bg-background px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Configuración clínica
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Catálogo de tratamientos</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Elegí únicamente lo que ofrece tu clínica y nombralo como lo conoce tu equipo. Los precios
              se deciden para cada paciente al preparar su plan, nunca aquí.
            </p>
          </div>
          {puedeEscribir ? (
            <Link
              href="/catalogo/nuevo"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-rosa-hover"
            >
              <Plus className="size-4" aria-hidden="true" /> Tratamiento personalizado
            </Link>
          ) : null}
        </header>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
            <header className="flex items-center justify-between gap-4 border-b px-5 py-4">
              <div>
                <h2 className="font-semibold">Catálogo de la clínica</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {total === 0 ? "Todavía no agregaste tratamientos." : `${total} tratamiento${total === 1 ? "" : "s"} disponible${total === 1 ? "" : "s"}.`}
                </p>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                Sin precios predefinidos
              </span>
            </header>

            {total === 0 ? (
              <div className="px-6 py-14 text-center">
                <BookOpen className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
                <h3 className="mt-4 font-semibold">Tu catálogo comienza vacío</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Usá la referencia odontológica para agregar tratamientos uno por uno o creá uno
                  personalizado. CLIDENT no impondrá nombres comerciales ni tarifas.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {categorias.map((categoria) => (
                  <section key={categoria.id}>
                    <h3 className="bg-muted px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {categoria.nombre}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="border-b text-xs text-muted-foreground">
                          <tr>
                            <th className="px-5 py-3 font-medium">Código</th>
                            <th className="px-5 py-3 font-medium">Nombre en la clínica</th>
                            <th className="px-5 py-3 font-medium">Alcance</th>
                            <th className="px-5 py-3 font-medium">Estado</th>
                            <th className="px-5 py-3 text-right font-medium">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {categoria.tratamientos.map((tratamiento) => (
                            <tr key={tratamiento.id} className={tratamiento.activo ? "" : "text-muted-foreground/70"}>
                              <td className="px-5 py-3 font-mono text-xs">{tratamiento.codigo}</td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2 font-medium">
                                  {tratamiento.favorito ? <Star className="size-3.5 fill-current text-advertencia" aria-label="Favorito" /> : null}
                                  {tratamiento.aliasPersonal ?? tratamiento.nombre}
                                </div>
                                {tratamiento.aliasPersonal ? (
                                  <p className="mt-0.5 text-xs text-muted-foreground">Nombre de la clínica: {tratamiento.nombre}</p>
                                ) : tratamiento.nombreReferencia && tratamiento.nombreReferencia !== tratamiento.nombre ? (
                                  <p className="mt-0.5 text-xs text-muted-foreground">Referencia: {tratamiento.nombreReferencia}</p>
                                ) : null}
                              </td>
                              <td className="px-5 py-3">{ETIQUETA_ALCANCE[tratamiento.alcance]}</td>
                              <td className="px-5 py-3">
                                <span className={tratamiento.activo ? "rounded-full bg-exito-suave px-2.5 py-1 text-xs font-medium text-exito-texto" : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"}>
                                  {tratamiento.activo ? "Disponible" : "Inactivo"}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <Link href={`/catalogo/${tratamiento.id}/editar`} className="font-medium underline-offset-4 hover:underline">
                                  {puedeEscribir ? "Editar y personalizar" : "Personalizar"}
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <aside className="min-w-0 rounded-xl border bg-card">
            <header className="border-b px-5 py-4">
              <h2 className="font-semibold">Referencia odontológica</h2>
              <p className="mt-1 text-sm text-muted-foreground">Códigos y nombres clínicos, sin precios.</p>
              <form className="relative mt-4" action="/catalogo">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input name="q" defaultValue={termino} placeholder="Código o tratamiento" className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm" />
              </form>
            </header>
            <div className="max-h-[70vh] overflow-y-auto">
              {referencias.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No quedan referencias que coincidan con la búsqueda.</p>
              ) : referencias.map((categoria) => (
                <section key={categoria.id} className="border-b last:border-0">
                  <h3 className="sticky top-0 bg-muted/95 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                    {categoria.nombre}
                  </h3>
                  <ul className="divide-y">
                    {categoria.plantillas.map((referencia) => (
                      <li key={referencia.codigo} className="flex items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="font-medium leading-5">{referencia.nombre}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {referencia.codigo} · {ETIQUETA_ALCANCE[referencia.alcance]}
                            {referencia.permiteMultiplesSesiones ? " · Varias sesiones" : ""}
                          </p>
                        </div>
                        {puedeEscribir ? (
                          <form action={agregarReferenciaDesdeFormulario}>
                            <input type="hidden" name="codigo" value={referencia.codigo} />
                            <button className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent">
                              Agregar
                            </button>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
