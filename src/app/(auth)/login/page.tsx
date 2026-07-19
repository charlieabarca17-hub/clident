import { redirect } from "next/navigation";

import { auth } from "@/server/auth/config";
import { iniciarSesion } from "@/server/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sesion = await auth();
  if (sesion?.user?.id) redirect(sesion.clinicaId ? "/" : "/elegir-clinica");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <section className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">CLIDENT</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ingresá con el correo de tu clínica.</p>
        {error ? <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Correo o contraseña incorrectos.</p> : null}
        <form action={iniciarSesion} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Correo
            <input name="correo" type="email" autoComplete="email" required className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            Contraseña
            <input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <button className="w-full rounded-lg bg-primary transition-colors hover:bg-rosa-hover px-4 py-2.5 text-sm font-medium text-primary-foreground">Entrar</button>
        </form>
      </section>
    </main>
  );
}
