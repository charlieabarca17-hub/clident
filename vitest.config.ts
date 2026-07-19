import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Solo unitarias por ahora. El proyecto de integración se cablea cuando exista la rama
// `pruebas` de Neon: esas suites hablan con PostgreSQL real y nunca con un simulacro
// (ADR-010) — RLS, EXCLUDE, columnas generadas y privilegios no se pueden mockear.
export default defineConfig({
  // El alias `@/` se declara acá a mano, espejando tsconfig.json. La alternativa era
  // `vite-tsconfig-paths`, y el stack son 8 piezas: una dependencia para no escribir
  // tres líneas no pasa el filtro de CLAUDE.md §15.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Mismo stub que la suite de integración: `server-only` es un módulo
      // virtual del compilador de Next, y un módulo de servidor sin Prisma
      // (rate-limit, por ejemplo) es perfectamente testeable en Node.
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
