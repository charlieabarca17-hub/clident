"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCtx } from "@/server/auth/context";
import {
  desactivarGoogleCalendar,
  getConexionGoogleCalendarPrivada,
} from "@/server/db/google-calendar";
import { descifrarTokenGoogle } from "@/server/integrations/google-calendar/crypto";
import { crearClienteGoogle } from "@/server/integrations/google-calendar/oauth";

export async function desconectarGoogleCalendar(): Promise<never> {
  const ctx = await requireCtx();
  const conexion = await getConexionGoogleCalendarPrivada(ctx);
  if (conexion?.activa) {
    try {
      const oauth = crearClienteGoogle();
      await oauth.revokeToken(descifrarTokenGoogle(conexion.refreshTokenCifrado));
    } catch {
      // La desconexión local debe completarse aunque Google esté temporalmente caído.
    }
    await desactivarGoogleCalendar(ctx);
  }
  revalidatePath("/configuracion/integraciones");
  redirect("/configuracion/integraciones?google=desconectado");
}
