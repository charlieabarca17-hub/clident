import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { leerEntornoGoogleCalendar } from "@/server/env";

function clave(): Buffer {
  const entorno = leerEntornoGoogleCalendar();
  if (!entorno) throw new Error("Google Calendar no está configurado.");
  const valor = Buffer.from(entorno.GOOGLE_TOKEN_ENCRYPTION_KEY, "base64");
  if (valor.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY debe contener exactamente 32 bytes en base64.");
  }
  return valor;
}

export function cifrarTokenGoogle(token: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", clave(), nonce);
  const cifrado = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", nonce.toString("base64url"), tag.toString("base64url"), cifrado.toString("base64url")].join(".");
}

export function descifrarTokenGoogle(valor: string): string {
  const [version, nonce64, tag64, cifrado64] = valor.split(".");
  if (version !== "v1" || !nonce64 || !tag64 || !cifrado64) {
    throw new Error("El token cifrado de Google no tiene un formato válido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", clave(), Buffer.from(nonce64, "base64url"));
  decipher.setAuthTag(Buffer.from(tag64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cifrado64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
