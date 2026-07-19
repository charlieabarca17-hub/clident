import Link from "next/link";

import { crearTratamientoDesdeFormulario } from "@/server/actions/catalogo";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import { listarCategorias } from "@/server/db/catalogo";

export default async function NuevoTratamientoPage() {
  const ctx = await requireCtx();
  requirePermiso(ctx, "catalogo:write");
  const categorias = await listarCategorias(ctx);

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">CLIDENT · Catálogo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nuevo tratamiento</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Las banderas definen cómo se asigna a un paciente y no se pueden editar después:
            si el comportamiento cambia, se crea un tratamiento nuevo y se desactiva este.
          </p>
        </header>

        <form action={crearTratamientoDesdeFormulario} className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Categoría *
              <select name="categoriaId" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                <option value="">Elegí una categoría</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">Código *
              <input name="codigo" required maxLength={20} placeholder="RES-09" className="mt-1 w-full rounded-lg border px-3 py-2 font-mono font-normal uppercase" />
            </label>
            <label className="block text-sm font-medium sm:col-span-2">Nombre *
              <input name="nombre" required maxLength={120} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <label className="block text-sm font-medium">Precio de lista (USD) *
              <input name="precio" required inputMode="decimal" placeholder="45.00" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <label className="block text-sm font-medium">Alcance *
              <select name="alcance" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                <option value="DIENTE">Por pieza</option>
                <option value="BOCA">Boca completa</option>
              </select>
            </label>
          </div>

          <fieldset className="rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Comportamiento al asignarlo</legend>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <label className="flex items-center gap-2"><input type="checkbox" name="requiereDiente" /> Exige indicar la pieza</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="permiteMultiplesDientes" /> Permite varias piezas</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="permiteSuperficies" /> Permite indicar superficies</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="permiteMultiplesSuperficies" /> Permite varias superficies</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="requiereDiagnostico" /> Exige diagnóstico previo</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="permiteMultiplesSesiones" /> Se realiza en varias sesiones</label>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Las superficies solo aplican a tratamientos por pieza. El catálogo nunca guarda la
              superficie: esa se elige al asignar el tratamiento a un paciente.
            </p>
          </fieldset>

          <div className="flex items-center justify-end gap-3">
            <Link href="/catalogo" className="rounded-lg px-4 py-2 text-sm">Cancelar</Link>
            <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Crear tratamiento</button>
          </div>
        </form>
      </section>
    </main>
  );
}
