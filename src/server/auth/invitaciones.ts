import "server-only";

import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";

import { db } from "@/server/db/client";

export function generarTokenInvitacion(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTokenInvitacion(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function establecerPasswordConInvitacion(token: string, password: string) {
  const tokenHash = hashTokenInvitacion(token);
  const usuario = await db.usuario.findUnique({
    where: { tokenInvitacionHash: tokenHash },
    select: { id: true, correo: true },
  });
  if (!usuario) return null;

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const consumo = await db.usuario.updateMany({
    where: {
      id: usuario.id,
      passwordHash: null,
      tokenInvitacionHash: tokenHash,
      tokenInvitacionExpiraEn: { gt: new Date() },
    },
    data: {
      passwordHash,
      tokenInvitacionHash: null,
      tokenInvitacionExpiraEn: null,
    },
  });
  return consumo.count === 1 ? usuario : null;
}
