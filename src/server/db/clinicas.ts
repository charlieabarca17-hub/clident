import "server-only";

import type { TenantContext } from "@/server/auth/types";

import { conTenant } from "./tenant";

/**
 * La clínica activa, para mostrar su nombre en la navegación. No recibe id por
 * parámetro a propósito: la clínica sale ÚNICAMENTE del contexto de sesión
 * (CLAUDE.md §2.2), y RLS devolvería cero filas para cualquier otra.
 */
export async function getClinicaActiva(ctx: TenantContext) {
  return conTenant(ctx, async (tx) => {
    return tx.clinica.findFirst({
      where: { id: ctx.clinicaId },
      select: { id: true, nombre: true, estado: true },
    });
  });
}
