import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 toma la URL de migraciones desde este archivo, nunca desde schema.prisma.
// `generate` no necesita una base de datos; por eso no usamos env(), que haría fallar ese
// comando si CI todavía no inyectó MIGRATION_DATABASE_URL. Los comandos de migración sí
// fallan de forma ruidosa si la URL falta o es inválida.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.MIGRATION_DATABASE_URL ?? "",
  },
});
