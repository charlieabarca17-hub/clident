import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";

import {
  actualizarTratamientoDesdeFormulario,
  guardarPreferenciaDesdeFormulario,
} from "@/server/actions/catalogo";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso, tienePermiso } from "@/server/auth/permissions";
import { getTratamiento } from "@/server/db/catalogo";

type EditarParams = Promise<{ tratamientoId: string }>;

export default async function EditarTratamientoPage({ params }: { params: EditarParams }) {
  const { tratamientoId } = await params;
  const ctx = await requireCtx();
  requirePermiso(ctx, "catalogo:read");
  const puedeEditarCatalogo = tienePermiso(ctx.roles, "catalogo:write");
  const tratamiento = await getTratamiento(ctx, tratamientoId);
  if (!tratamiento) notFound();

  const actualizar = actualizarTratamientoDesdeFormulario.bind(null, tratamiento.id);
  const guardarPreferencia = guardarPreferenciaDesdeFormulario.bind(null, tratamiento.id);

  return (
    <main className="min-h-full bg-background px-5 py-6 sm:px-8">
      <section className="mx-auto max-w-3xl space-y-5">
        <header className="border-b pb-5">
          <Link href="/catalogo" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Catálogo</Link>
          <p className="mt-5 font-mono text-xs text-muted-foreground">{tratamiento.codigo}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{tratamiento.nombre}</h1>
          {tratamiento.nombreReferencia ? (
            <p className="mt-1 text-sm text-muted-foreground">Referencia clínica: {tratamiento.nombreReferencia}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Tratamiento personalizado de la clínica.</p>
          )}
        </header>

        <form action={guardarPreferencia} className="rounded-xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <Star className="mt-0.5 size-5 text-advertencia" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">Mi forma de encontrarlo</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Este alias y favorito son personales. No cambian el expediente ni lo que ve el resto de la clínica.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-sm font-medium">Mi alias
              <input name="alias" maxLength={120} defaultValue={tratamiento.aliasPersonal ?? ""} placeholder="Ej.: Conducto anterior" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm font-medium">
              <input type="checkbox" name="favorito" defaultChecked={tratamiento.favorito} />
              Marcar como favorito
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent">Guardar preferencia</button>
          </div>
        </form>

        {puedeEditarCatalogo ? (
          <form action={actualizar} className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Configuración compartida de la clínica</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Este nombre aparece en planes, procedimientos y selectores para todo el equipo.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium sm:col-span-2">Nombre usado en la clínica *
                <input name="nombre" required maxLength={120} defaultValue={tratamiento.nombre} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="activo" defaultChecked={tratamiento.activo} />
                Disponible para planes nuevos
              </label>
            </div>
            <p className="mt-5 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              Código y comportamiento clínico permanecen fijos. Desactivar no borra planes, procedimientos ni historial.
              El precio siempre se define dentro del plan del paciente.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Link href="/catalogo" className="rounded-lg px-4 py-2 text-sm">Cancelar</Link>
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-rosa-hover">Guardar cambios</button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}
