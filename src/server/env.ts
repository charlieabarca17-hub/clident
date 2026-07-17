import { z } from "zod";

const urlPostgres = z
  .string()
  .url()
  .refine((valor) => valor.startsWith("postgresql://") || valor.startsWith("postgres://"), {
    message: "DATABASE_URL debe usar el protocolo PostgreSQL.",
  });

const esquemaRuntime = z.object({
  DATABASE_URL: urlPostgres,
});

const esquemaAuth = z.object({
  AUTH_SECRET: z.string().min(32),
});

/**
 * Valida los secretos que puede conocer la aplicación en runtime.
 *
 * La credencial de migraciones es capaz de crear tablas y conceder privilegios: si llega
 * a Vercel, cualquier endpoint comprometido hereda ese poder. Por eso su mera presencia
 * aborta el proceso antes de que Next pueda atender una solicitud (ADR-010, §4.4).
 */
export function leerEntornoRuntime(
  entrada: Readonly<Record<string, string | undefined>> = process.env,
) {
  if ("MIGRATION_DATABASE_URL" in entrada) {
    throw new Error(
      "MIGRATION_DATABASE_URL no puede existir en runtime. Solo GitHub Actions la usa para migraciones.",
    );
  }

  return esquemaRuntime.parse(entrada);
}

export function leerEntornoAuth(
  entrada: Readonly<Record<string, string | undefined>> = process.env,
) {
  return esquemaAuth.parse(entrada);
}
