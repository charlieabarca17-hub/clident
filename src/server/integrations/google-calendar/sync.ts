import "server-only";

import { createHash } from "node:crypto";
import { google } from "googleapis";

import type { TenantContext } from "@/server/auth/types";
import {
  getCitaParaGoogleCalendar,
  guardarEstadoSincronizacionGoogle,
} from "@/server/db/google-calendar";

import { descifrarTokenGoogle } from "./crypto";
import { crearClienteGoogle } from "./oauth";

function idEvento(clinicaId: string, citaId: string): string {
  // Google admite base32hex; un SHA-256 hexadecimal evita guiones inválidos y
  // hace idempotente un reintento aun si la primera respuesta se perdió.
  return createHash("sha256").update(`${clinicaId}:${citaId}`).digest("hex").slice(0, 48);
}

function codigoHttp(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const valor = error as { code?: number; response?: { status?: number } };
  return valor.response?.status ?? valor.code;
}

function mensajeSeguro(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : "Google Calendar no respondió correctamente.";
  // Nunca guardar payloads completos: algunas librerías incluyen tokens o
  // cuerpos de respuesta dentro del error serializado.
  return mensaje.replace(/ya29\.[A-Za-z0-9_-]+/g, "[token]").slice(0, 1000);
}

export async function sincronizarCitaGoogleCalendar(
  ctx: TenantContext,
  citaId: string,
): Promise<"sin-conexion" | "sincronizada" | "cancelada"> {
  const cita = await getCitaParaGoogleCalendar(ctx, citaId);
  if (!cita) return "sin-conexion";
  const conexion = cita.odontologo.conexionGoogleCalendar;
  if (!conexion?.activa) return "sin-conexion";

  const eventoId = cita.sincronizacionesGoogle[0]?.googleEventoId ?? idEvento(ctx.clinicaId, cita.id);
  const oauth = crearClienteGoogle();
  oauth.setCredentials({ refresh_token: descifrarTokenGoogle(conexion.refreshTokenCifrado) });
  const calendar = google.calendar({ version: "v3", auth: oauth });

  if (cita.estado === "CANCELADA") {
    try {
      await calendar.events.delete({ calendarId: conexion.calendarioId, eventId: eventoId });
    } catch (error) {
      if (codigoHttp(error) !== 404) throw error;
    }
    await guardarEstadoSincronizacionGoogle(ctx, {
      citaId: cita.id,
      conexionId: conexion.id,
      googleEventoId: eventoId,
      estado: "CANCELADA",
    });
    return "cancelada";
  }

  const evento = {
    id: eventoId,
    summary: "Cita CLIDENT",
    description: "Cita gestionada en CLIDENT. Consultá el expediente dentro del sistema; Google Calendar no contiene información clínica.",
    location: `${cita.clinica.nombre} · ${cita.sucursal.nombre}`,
    start: { dateTime: cita.inicioEn.toISOString(), timeZone: "America/El_Salvador" },
    end: { dateTime: cita.finEn.toISOString(), timeZone: "America/El_Salvador" },
    extendedProperties: { private: { clidentCitaId: cita.id } },
  };

  try {
    if (cita.sincronizacionesGoogle.length > 0) {
      await calendar.events.update({
        calendarId: conexion.calendarioId,
        eventId: eventoId,
        requestBody: evento,
        sendUpdates: "none",
      });
    } else {
      try {
        await calendar.events.insert({
          calendarId: conexion.calendarioId,
          requestBody: evento,
          sendUpdates: "none",
        });
      } catch (error) {
        if (codigoHttp(error) !== 409) throw error;
        await calendar.events.update({
          calendarId: conexion.calendarioId,
          eventId: eventoId,
          requestBody: evento,
          sendUpdates: "none",
        });
      }
    }
    await guardarEstadoSincronizacionGoogle(ctx, {
      citaId: cita.id,
      conexionId: conexion.id,
      googleEventoId: eventoId,
      estado: "SINCRONIZADA",
    });
    return "sincronizada";
  } catch (error) {
    await guardarEstadoSincronizacionGoogle(ctx, {
      citaId: cita.id,
      conexionId: conexion.id,
      googleEventoId: eventoId,
      estado: "ERROR",
      ultimoError: mensajeSeguro(error),
    });
    throw error;
  }
}

export async function sincronizarCitaGoogleCalendarSeguro(
  ctx: TenantContext,
  citaId: string,
): Promise<void> {
  try {
    await sincronizarCitaGoogleCalendar(ctx, citaId);
  } catch {
    // La agenda clínica es la fuente de verdad. Una caída de Google no puede
    // impedir crear, reprogramar o cancelar una cita en CLIDENT.
  }
}
