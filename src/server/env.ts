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

const esquemaGoogleCalendar = z.object({
  GOOGLE_CLIENT_ID: z.string().min(10),
  GOOGLE_CLIENT_SECRET: z.string().min(10),
  GOOGLE_CALENDAR_REDIRECT_URI: z.string().url(),
  GOOGLE_TOKEN_ENCRYPTION_KEY: z.string().min(40),
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

export function leerEntornoGoogleCalendar(
  entrada: Readonly<Record<string, string | undefined>> = process.env,
) {
  const claves = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REDIRECT_URI",
    "GOOGLE_TOKEN_ENCRYPTION_KEY",
  ] as const;
  if (claves.every((clave) => !entrada[clave])) return null;
  return esquemaGoogleCalendar.parse(entrada);
}
