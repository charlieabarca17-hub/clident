import Link from "next/link";
import { notFound } from "next/navigation";

import { usdEditable } from "@/lib/money";
import { actualizarTratamientoDesdeFormulario } from "@/server/actions/catalogo";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import { getTratamiento } from "@/server/db/catalogo";

type EditarParams = Promise<{ tratamientoId: string }>;

export default async function EditarTratamientoPage({ params }: { params: EditarParams }) {
  const { tratamientoId } = await params;
  const ctx = await requireCtx();
  requirePermiso(ctx, "catalogo:write");
  const tratamiento = await getTratamiento(ctx, tratamientoId);
  if (!tratamiento) notFound();

  const actualizar = actualizarTratamientoDesdeFormulario.bind(null, tratamiento.id);

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">CLIDENT · Catálogo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            <span className="font-mono text-neutral-500">{tratamiento.codigo}</span> · {tratamiento.nombre}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Cambiar el precio de lista solo afecta asignaciones futuras: los planes ya creados
            conservan el precio con el que se ofrecieron.
          </p>
        </header>

        <form action={actualizar} className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium sm:col-span-2">Nombre *
              <input name="nombre" required maxLength={120} defaultValue={tratamiento.nombre} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <label className="block text-sm font-medium">Precio de lista (USD) *
              <input name="precio" required inputMode="decimal" defaultValue={usdEditable(tratamiento.precioListaCentavos)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm font-medium">
              <input type="checkbox" name="activo" defaultChecked={tratamiento.activo} />
              Disponible en el selector
            </label>
          </div>

          <p className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
            El código y las banderas de comportamiento no se editan: definen qué es este
            tratamiento. Si necesitás un comportamiento distinto, creá un tratamiento nuevo
            y desactivá este. Desactivarlo solo lo quita del selector — nunca toca planes,
            procedimientos ni historiales existentes.
          </p>

          <div className="flex items-center justify-end gap-3">
            <Link href="/catalogo" className="rounded-lg px-4 py-2 text-sm">Cancelar</Link>
            <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Guardar cambios</button>
          </div>
        </form>
      </section>
    </main>
  );
}
