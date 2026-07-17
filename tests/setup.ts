import { execFileSync } from "node:child_process";
import pg from "pg";

import { sembrarDientes } from "../prisma/seed/dientes.ts";

export default async function setup(): Promise<void> {
  const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL;
  const appUrl = process.env.TEST_DATABASE_URL;
  const confirmacion = process.env.TEST_DATABASE_CONFIRM;
  if (!migrationUrl || !appUrl || confirmacion !== "pruebas") {
    throw new Error(
      "Las pruebas de integración requieren sus dos URLs y TEST_DATABASE_CONFIRM=pruebas.",
    );
  }

  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      cwd: process.cwd(),
      env: { ...process.env, MIGRATION_DATABASE_URL: migrationUrl },
      stdio: "inherit",
    },
  );

  const migrator = new pg.Client({ connectionString: migrationUrl });
  await migrator.connect();
  try {
    await migrator.query(
      "TRUNCATE TABLE citas, desactivaciones_alertas_medicas, alertas_medicas, expedientes, pacientes, auditoria, membresias, sucursales, usuarios, clinicas RESTART IDENTITY CASCADE",
    );
  } finally {
    await migrator.end();
  }
  await sembrarDientes(migrationUrl);
}
