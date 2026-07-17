-- CLIDENT — bootstrap de roles PostgreSQL
--
-- Se ejecuta UNA VEZ por rama Neon con la conexión propietaria inicial (`neondb_owner`).
-- Antes de correrlo, crear clident_migrator, clident_app y clident_readonly mediante SQL,
-- con LOGIN, NOINHERIT, NOCREATEDB, NOCREATEROLE y NOBYPASSRLS. No se usan los roles de
-- la CLI/Console de Neon: reciben membresía en neon_superuser y por ello evaden RLS.
--
-- El migrator es dueño de las tablas que crean las migraciones. La aplicación nunca lo es.
-- Repetir este script es seguro: GRANT/REVOKE/ALTER DEFAULT PRIVILEGES son idempotentes.

-- El propietario inicial puede configurar los defaults del migrator durante el bootstrap.
-- No le concede nada nuevo que no tenga ya como propietario de Neon.
GRANT clident_migrator TO neondb_owner;

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
