import { cerrarSesion, elegirClinica } from "@/server/actions/auth";
import { requireAuth } from "@/server/auth/context";
import { listarMisMembresias } from "@/server/auth/membresias";
import { AutoseleccionClinica } from "./autoseleccion";

export default async function ElegirClinicaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const auth = await requireAuth();
  const membresias = await listarMisMembresias(auth);
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <section className="w-full max-w-lg rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">CLIDENT</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Elegí una clínica</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tus permisos pueden ser distintos en cada clínica.</p>
        {error ? <p role="alert" className="mt-4 text-sm text-destructive">La selección ya no está disponible.</p> : null}
        {membresias.length === 0 ? (
          <>
            <p className="mt-6 rounded-lg bg-advertencia-suave p-4 text-sm text-foreground">No tenés membresías activas.</p>
            <form action={cerrarSesion} className="mt-4">
              <button className="w-full rounded-lg border px-4 py-2 text-sm font-medium">Cerrar sesión</button>
            </form>
          </>
        ) : membresias.length === 1 ? (
          <AutoseleccionClinica clinicaId={membresias[0].clinicaId} seleccionar={elegirClinica} />
        ) : (
          <div className="mt-6 space-y-3">
            {membresias.map((membresia) => (
              <form action={elegirClinica} key={membresia.id}>
                <input type="hidden" name="clinicaId" value={membresia.clinicaId} />
                <button className="flex w-full items-center justify-between rounded-xl border p-4 text-left hover:bg-accent">
                  <span>
                    <span className="block font-medium">{membresia.clinica.nombre}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{membresia.roles.join(" · ")}</span>
                  </span>
                  <span aria-hidden>→</span>
                </button>
              </form>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
