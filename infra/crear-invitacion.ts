import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const correo = process.argv[2]?.trim().toLowerCase();
const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!correo || !connectionString) {
  throw new Error("Uso: MIGRATION_DATABASE_URL=... npm run invitar-admin -- correo@ejemplo.com");
}

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const cliente = new pg.Client({ connectionString });
await cliente.connect();
try {
  const resultado = await cliente.query(
    `UPDATE usuarios
     SET token_invitacion_hash = $1,
         token_invitacion_expira_en = CURRENT_TIMESTAMP + INTERVAL '24 hours',
         actualizado_en = CURRENT_TIMESTAMP
     WHERE correo = $2 AND password_hash IS NULL
     RETURNING id`,
    [hash, correo],
  );
  if (resultado.rowCount !== 1) throw new Error("Usuario inexistente o contraseña ya establecida.");
  // El token solo se muestra una vez para entregarlo al administrador: no ejecutes este
  // script en CI ni en una terminal cuyo stdout se archive. La base guarda solo su hash.
  console.log(`/establecer-contrasena/${token}`);
} finally {
  await cliente.end();
}
