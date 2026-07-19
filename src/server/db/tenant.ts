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

/**
 * Margen de tiempo de la transacción. El default de Prisma son 5 s, pensado
 * para una base local; contra una base en la nube cada viaje cuesta decenas de
 * milisegundos y una operación legítimamente grande —clonar el catálogo, crear
 * el calendario de 18 cuotas— lo agota y le falla al usuario en la cara.
 *
 * No es una licencia para escribir bucles lentos: las operaciones masivas usan
 * inserción por lotes. Es el colchón para la latencia de red que el default
 * no contempla.
 */
const LIMITE_TRANSACCION_MS = 20_000;

export async function conTenant<T>(
  contexto: { usuarioId: string; clinicaId: string },
  operacion: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.usuario_id', ${contexto.usuarioId}, true)`;
      await tx.$queryRaw`SELECT set_config('app.clinica_id', ${contexto.clinicaId}, true)`;
      return operacion(tx);
    },
    { timeout: LIMITE_TRANSACCION_MS, maxWait: 10_000 },
  );
}
