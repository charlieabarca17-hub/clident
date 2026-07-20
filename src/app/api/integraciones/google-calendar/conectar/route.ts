import { NextResponse } from "next/server";

import { requireCtx } from "@/server/auth/context";
import {
  GOOGLE_CALENDAR_SCOPES,
  crearClienteGoogle,
  crearEstadoGoogle,
  googleCalendarConfigurado,
} from "@/server/integrations/google-calendar/oauth";

export async function GET(request: Request) {
  const ctx = await requireCtx();
  if (!googleCalendarConfigurado()) {
    return NextResponse.redirect(new URL("/configuracion/integraciones?google=no-configurado", request.url));
  }
  const cliente = crearClienteGoogle();
  const url = cliente.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: [...GOOGLE_CALENDAR_SCOPES],
    state: crearEstadoGoogle(ctx),
  });
  return NextResponse.redirect(url);
}
