import { establecerPassword } from "@/server/actions/auth";

export function FormularioEstablecerPassword({
  token,
  error,
}: {
  token: string;
  error?: string;
}) {
  const errorVisible = !token ? "token" : error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <section className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">CLIDENT</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Creá tu contraseña</h1>
        <p className="mt-2 text-sm text-muted-foreground">La invitación se utiliza una sola vez.</p>
        {errorVisible === "token" ? <p role="alert" className="mt-4 text-sm text-destructive">El enlace está incompleto, venció o ya fue utilizado.</p> : null}
        {errorVisible === "password" ? <p role="alert" className="mt-4 text-sm text-destructive">Usá al menos 12 caracteres y repetí la misma contraseña.</p> : null}
        <form action={establecerPassword} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <label className="block text-sm font-medium">
            Contraseña
            <input name="password" type="password" minLength={12} autoComplete="new-password" required className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="block text-sm font-medium">
            Confirmar contraseña
            <input name="confirmacion" type="password" minLength={12} autoComplete="new-password" required className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <button className="w-full rounded-lg bg-primary transition-colors hover:bg-rosa-hover px-4 py-2.5 text-sm font-medium text-primary-foreground">Guardar y continuar</button>
        </form>
      </section>
    </main>
  );
}
