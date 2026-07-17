import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";
import { leerEntornoRuntime } from "../env";

// Este es el ÚNICO lugar que construye PrismaClient (ARQUITECTURA.md §11). En desarrollo
// se reutiliza la instancia entre recargas para no abrir un pool por cada módulo evaluado.
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };
const env = leerEntornoRuntime();

function crearCliente() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = globalParaPrisma.prisma ?? crearCliente();

if (process.env.NODE_ENV !== "production") {
  globalParaPrisma.prisma = db;
}
