import { cerrarSesion } from "@/server/actions/auth";
import { requireCtx } from "@/server/auth/context";

export default async function Home() {
  const ctx = await requireCtx();
  return (
    <main className="flex flex-1 items-center justify-center bg-neutral-50 p-8">
      <section className="w-full max-w-xl rounded-2xl border bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-neutral-500">CLIDENT</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Base segura lista</h1>
        <p className="mt-3 text-sm text-neutral-600">La sesión está vinculada a una membresía activa y fue revalidada contra PostgreSQL.</p>
        <dl className="mt-6 grid gap-3 rounded-xl bg-neutral-50 p-4 text-sm">
          <div><dt className="text-neutral-500">Clínica</dt><dd className="font-mono">{ctx.clinicaId}</dd></div>
          <div><dt className="text-neutral-500">Roles</dt><dd>{ctx.roles.join(" · ")}</dd></div>
        </dl>
        <form action={cerrarSesion} className="mt-6">
          <button className="rounded-lg border px-4 py-2 text-sm font-medium">Cerrar sesión</button>
        </form>
      </section>
    </main>
  );
}
