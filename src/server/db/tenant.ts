import "server-only";

import type { Prisma } from "./generated/client";
import { db } from "./client";

export type TenantTransaction = Prisma.TransactionClient;

export async function conUsuario<T>(
  usuarioId: string,
  operacion: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.usuario_id', ${usuarioId}, true)`;
    return operacion(tx);
  });
}

export async function conTenant<T>(
  contexto: { usuarioId: string; clinicaId: string },
  operacion: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.usuario_id', ${contexto.usuarioId}, true)`;
    await tx.$queryRaw`SELECT set_config('app.clinica_id', ${contexto.clinicaId}, true)`;
    return operacion(tx);
  });
}
