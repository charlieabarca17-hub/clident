import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const correo = process.argv[2]?.trim().toLowerCase();
const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!correo || !connectionString) {
  throw new Error("Uso: npm run restablecer-contrasena -- correo@ejemplo.com");
}

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const cliente = new pg.Client({ connectionString });
await cliente.connect();
try {
  // El token reemplaza cualquier enlace anterior y desactiva la clave olvidada.
  // Se imprime una sola vez: no ejecutes este comando en CI ni en una terminal archivada.
  const resultado = await cliente.query(
    `UPDATE usuarios
     SET password_hash = NULL,
         token_invitacion_hash = $1,
         token_invitacion_expira_en = CURRENT_TIMESTAMP + INTERVAL '24 hours',
         actualizado_en = CURRENT_TIMESTAMP
     WHERE correo = $2 AND password_hash IS NOT NULL
     RETURNING id`,
    [hash, correo],
  );
  if (resultado.rowCount !== 1) {
    throw new Error("Usuario inexistente o sin contraseña. Para una cuenta nueva usá invitar-admin.");
  }
  console.log(`/establecer-contrasena/${token}`);
} finally {
  await cliente.end();
}
