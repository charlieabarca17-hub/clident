import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || process.env.TEST_DATABASE_CONFIRM !== "pruebas") {
  throw new Error(
    "Las pruebas de integración requieren TEST_DATABASE_URL y TEST_DATABASE_CONFIRM=pruebas.",
  );
}

// El cliente Prisma se importa antes del globalSetup. Forzarlo acá evita que una
// DATABASE_URL local apunte accidentalmente a Desarrollo durante una suite que trunca datos.
process.env.DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
