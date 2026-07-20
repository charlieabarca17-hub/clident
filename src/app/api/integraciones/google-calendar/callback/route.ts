import { google } from "googleapis";
import { NextResponse } from "next/server";

import { requireCtx } from "@/server/auth/context";
import { guardarConexionGoogleCalendar } from "@/server/db/google-calendar";
import { cifrarTokenGoogle } from "@/server/integrations/google-calendar/crypto";
import { crearClienteGoogle, validarEstadoGoogle } from "@/server/integrations/google-calendar/oauth";

function volver(request: Request, estado: string) {
  return NextResponse.redirect(new URL(`/configuracion/integraciones?google=${estado}`, request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return volver(request, "cancelado");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return volver(request, "error");

  try {
    const ctx = await requireCtx();
    validarEstadoGoogle(state, ctx);
    const oauth = crearClienteGoogle();
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token || !tokens.id_token) {
      throw new Error("Google no devolvió las credenciales necesarias.");
    }
    oauth.setCredentials(tokens);
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token });
    const correo = ticket.getPayload()?.email;
    if (!correo) throw new Error("Google no devolvió el correo de la cuenta conectada.");

    const calendar = google.calendar({ version: "v3", auth: oauth });
    const creado = await calendar.calendars.insert({
      requestBody: {
        summary: "CLIDENT",
        description: "Citas laborales sincronizadas desde CLIDENT. Los detalles clínicos permanecen dentro de CLIDENT.",
        timeZone: "America/El_Salvador",
      },
    });
    if (!creado.data.id) throw new Error("Google no devolvió el identificador del calendario.");

    await guardarConexionGoogleCalendar(ctx, {
      correoGoogle: correo.toLowerCase(),
      refreshTokenCifrado: cifrarTokenGoogle(tokens.refresh_token),
      calendarioId: creado.data.id,
      scopes: tokens.scope?.split(" ").filter(Boolean) ?? [],
    });
    return volver(request, "conectado");
  } catch {
    return volver(request, "error");
  }
}
