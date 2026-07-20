import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";

import { leerEntornoAuth, leerEntornoGoogleCalendar } from "@/server/env";
import type { TenantContext } from "@/server/auth/types";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.app.created",
] as const;

export function googleCalendarConfigurado(): boolean {
  return leerEntornoGoogleCalendar() !== null;
}

export function crearClienteGoogle() {
  const entorno = leerEntornoGoogleCalendar();
  if (!entorno) throw new Error("Google Calendar no está configurado.");
  return new google.auth.OAuth2(
    entorno.GOOGLE_CLIENT_ID,
    entorno.GOOGLE_CLIENT_SECRET,
    entorno.GOOGLE_CALENDAR_REDIRECT_URI,
  );
}

type EstadoGoogle = {
  usuarioId: string;
  clinicaId: string;
  membresiaId: string;
  exp: number;
};

function firma(payload: string): string {
  return createHmac("sha256", leerEntornoAuth().AUTH_SECRET).update(payload).digest("base64url");
}

export function crearEstadoGoogle(ctx: TenantContext): string {
  const payload = Buffer.from(JSON.stringify({
    usuarioId: ctx.usuarioId,
    clinicaId: ctx.clinicaId,
    membresiaId: ctx.membresiaId,
    exp: Date.now() + 10 * 60 * 1_000,
  } satisfies EstadoGoogle)).toString("base64url");
  return `${payload}.${firma(payload)}`;
}

export function validarEstadoGoogle(valor: string, ctx: TenantContext): void {
  const [payload, firmaRecibida] = valor.split(".");
  if (!payload || !firmaRecibida) throw new Error("La autorización de Google no es válida.");
  const esperada = Buffer.from(firma(payload));
  const recibida = Buffer.from(firmaRecibida);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    throw new Error("La autorización de Google no es válida.");
  }
  const estado = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as EstadoGoogle;
  if (
    estado.exp < Date.now() ||
    estado.usuarioId !== ctx.usuarioId ||
    estado.clinicaId !== ctx.clinicaId ||
    estado.membresiaId !== ctx.membresiaId
  ) {
    throw new Error("La autorización de Google venció o pertenece a otra sesión.");
  }
}
