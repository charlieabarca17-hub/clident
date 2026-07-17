import "server-only";

import { redirect } from "next/navigation";

import { auth } from "./config";
import { validarMembresiaActiva } from "./membresias";
import type { AuthContext, TenantContext } from "./types";

export async function requireAuth(): Promise<AuthContext> {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/login");
  return { usuarioId: sesion.user.id };
}

export async function requireCtx(): Promise<TenantContext> {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/login");
  if (!sesion.clinicaId) redirect("/elegir-clinica");

  const membresia = await validarMembresiaActiva(sesion.user.id, sesion.clinicaId);
  if (!membresia) redirect("/elegir-clinica");
  return {
    usuarioId: sesion.user.id,
    clinicaId: membresia.clinicaId,
    membresiaId: membresia.id,
    roles: membresia.roles,
  };
}
