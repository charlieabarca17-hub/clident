-- CLIDENT — bootstrap de roles PostgreSQL
--
-- Se ejecuta UNA VEZ por rama Neon con la conexión propietaria inicial (`neondb_owner`).
-- Antes de correrlo, crear clident_migrator, clident_app y clident_readonly mediante SQL
-- (cada uno con su contraseña). Los atributos de seguridad ya NO dependen de que se hayan
-- creado bien: este script los reafirma más abajo. No se usan los roles de la CLI/Console
-- de Neon: reciben membresía en neon_superuser y por ello evaden RLS.
--
-- El migrator es dueño de las tablas que crean las migraciones. La aplicación nunca lo es.
-- Repetir este script es seguro: ALTER ROLE, GRANT/REVOKE y ALTER DEFAULT PRIVILEGES son
-- idempotentes.

-- El propietario inicial puede configurar los defaults del migrator durante el bootstrap.
-- No le concede nada nuevo que no tenga ya como propietario de Neon.
GRANT clident_migrator TO neondb_owner;

-- Autocorrección de atributos de seguridad (Ciclo 5).
--
-- Un rol pudo crearse con atributos peligrosos —el caso real es clident_migrator con
-- BYPASSRLS, que ignora TODA política RLS y con ello el aislamiento entre clínicas
-- (ADR-001, ADR-015)—. Que el migrador evada RLS no rompe nada visible: la app sigue
-- pareciendo que funciona mientras cualquier fuga de esa credencial abre los expedientes
-- de todas las clínicas. Por eso el invariante se reafirma acá, no se asume.
--
-- Reafirmar el estado correcto de los tres roles hace el bootstrap autocorrectivo: correrlo
-- los deja exactamente como deben estar, sin importar cómo se crearon. `neondb_owner` puede
-- ejecutarlo porque tiene CREATEROLE, BYPASSRLS y ADMIN sobre los tres: quitarle BYPASSRLS a
-- otro rol exige tener uno mismo BYPASSRLS. No se tocan SUPERUSER ni la contraseña (el
-- propietario de Neon no es superusuario; los tres ya nacen NOSUPERUSER).
ALTER ROLE clident_migrator WITH LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE clident_app      WITH LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE clident_readonly WITH LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS;

REVOKE ALL ON DATABASE neondb FROM PUBLIC;
-- CREATE dentro de esta base permite instalar extensiones versionadas por migraciones
-- (por ejemplo btree_gist). No concede CREATEDB, superusuario ni BYPASSRLS.
GRANT CONNECT, CREATE ON DATABASE neondb TO clident_migrator;
GRANT CONNECT ON DATABASE neondb TO clident_app, clident_readonly;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO clident_migrator;
GRANT USAGE ON SCHEMA public TO clident_app, clident_readonly;

-- Default restrictivo (ADR-012): una tabla nueva nace legible; cualquier escritura se
-- concede explícitamente en la misma migración que declara RLS y su clase de privilegio.
ALTER DEFAULT PRIVILEGES FOR ROLE clident_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO clident_app;
ALTER DEFAULT PRIVILEGES FOR ROLE clident_migrator IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO clident_app;
ALTER DEFAULT PRIVILEGES FOR ROLE clident_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO clident_readonly;
