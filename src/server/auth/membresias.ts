import "server-only";

import { conUsuario } from "@/server/db/tenant";
import type { AuthContext, Rol } from "./types";

function clinicaUtilizable(ahora = new Date()) {
  return {
    estado: { in: ["ACTIVA", "PRUEBA"] as ("ACTIVA" | "PRUEBA")[] },
    OR: [{ vigenteHasta: null }, { vigenteHasta: { gt: ahora } }],
  };
}

export async function listarMisMembresias(auth: AuthContext) {
  return conUsuario(auth.usuarioId, (tx) =>
    tx.membresia.findMany({
      where: {
        usuarioId: auth.usuarioId,
        activa: true,
        clinica: clinicaUtilizable(),
      },
      select: {
        id: true,
        clinicaId: true,
        roles: true,
        clinica: { select: { nombre: true, estado: true } },
      },
      orderBy: { clinica: { nombre: "asc" } },
    }),
  );
}

export async function validarMembresiaActiva(usuarioId: string, clinicaId: string) {
  const membresia = await conUsuario(usuarioId, (tx) =>
    tx.membresia.findFirst({
      where: {
        usuarioId,
        clinicaId,
        activa: true,
        clinica: clinicaUtilizable(),
      },
      select: { id: true, clinicaId: true, roles: true },
    }),
  );
  if (!membresia) return null;
  return { ...membresia, roles: membresia.roles as Rol[] };
}
