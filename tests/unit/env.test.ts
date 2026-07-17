import { describe, expect, it } from "vitest";

import { leerEntornoAuth, leerEntornoRuntime } from "@/server/env";

describe("leerEntornoRuntime", () => {
  it("acepta una URL PostgreSQL de la aplicación", () => {
    expect(
      leerEntornoRuntime({
        DATABASE_URL: "postgresql://clident_app:secreto@localhost:5432/neondb?sslmode=require",
      }),
    ).toEqual({
      DATABASE_URL: "postgresql://clident_app:secreto@localhost:5432/neondb?sslmode=require",
    });
  });

  it("aborta si la credencial de migraciones llega al runtime", () => {
    expect(() =>
      leerEntornoRuntime({
        DATABASE_URL: "postgresql://clident_app:secreto@localhost:5432/neondb",
        MIGRATION_DATABASE_URL: "postgresql://clident_migrator:secreto@localhost:5432/neondb",
      }),
    ).toThrow("MIGRATION_DATABASE_URL no puede existir en runtime");
  });

  it("exige un secreto de autenticación suficientemente largo", () => {
    expect(() => leerEntornoAuth({ AUTH_SECRET: "corto" })).toThrow();
    expect(leerEntornoAuth({ AUTH_SECRET: "a".repeat(32) })).toEqual({
      AUTH_SECRET: "a".repeat(32),
    });
  });
});
