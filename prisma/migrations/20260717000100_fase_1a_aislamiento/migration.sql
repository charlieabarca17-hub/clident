-- Fase 1A: identidad, pertenencia y aislamiento real entre clínicas.
CREATE TYPE "EstadoClinica" AS ENUM ('ACTIVA', 'SUSPENDIDA', 'PRUEBA');
CREATE TYPE "Rol" AS ENUM ('ADMINISTRADOR', 'ODONTOLOGO', 'RECEPCION', 'CAJA');
CREATE TYPE "Denticion" AS ENUM ('PERMANENTE', 'TEMPORAL');
CREATE TYPE "TipoDiente" AS ENUM ('INCISIVO', 'CANINO', 'PREMOLAR', 'MOLAR');
CREATE TYPE "Superficie" AS ENUM ('COMPLETO', 'MESIAL', 'DISTAL', 'VESTIBULAR', 'PALATINA', 'LINGUAL', 'INCISAL', 'OCLUSAL');

CREATE TABLE "clinicas" (
  "id" TEXT PRIMARY KEY, "nombre" TEXT NOT NULL,
  "estado" "EstadoClinica" NOT NULL DEFAULT 'PRUEBA', "vigente_hasta" TIMESTAMP(3),
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "usuarios" (
  "id" TEXT PRIMARY KEY, "correo" TEXT NOT NULL UNIQUE, "nombre" TEXT NOT NULL,
  "password_hash" TEXT, "es_operador_plataforma" BOOLEAN NOT NULL DEFAULT false,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "sucursales" (
  "id" TEXT PRIMARY KEY, "clinica_id" TEXT NOT NULL REFERENCES "clinicas"("id") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "nombre" TEXT NOT NULL, "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMP(3) NOT NULL, UNIQUE ("clinica_id", "id")
);
CREATE TABLE "membresias" (
  "id" TEXT PRIMARY KEY, "clinica_id" TEXT NOT NULL REFERENCES "clinicas"("id") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "usuario_id" TEXT NOT NULL REFERENCES "usuarios"("id") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "roles" "Rol"[] NOT NULL, "activa" BOOLEAN NOT NULL DEFAULT true,
  "jvpo" TEXT, "especialidad" TEXT, "color_agenda" TEXT,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMP(3) NOT NULL,
  UNIQUE ("usuario_id", "clinica_id"), UNIQUE ("clinica_id", "id"),
  CONSTRAINT "membresias_con_rol" CHECK (array_length("roles", 1) >= 1)
);
CREATE TABLE "auditoria" (
  "id" TEXT PRIMARY KEY, "clinica_id" TEXT NOT NULL REFERENCES "clinicas"("id") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "usuario_id" TEXT REFERENCES "usuarios"("id") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "accion" TEXT NOT NULL, "entidad" TEXT NOT NULL, "entidad_id" TEXT, "detalle" JSONB,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("clinica_id", "id")
);
CREATE TABLE "dientes_ref" (
  "fdi" INTEGER PRIMARY KEY, "denticion" "Denticion" NOT NULL,
  "tipo" "TipoDiente" NOT NULL, "cuadrante" INTEGER NOT NULL,
  "posicion" INTEGER NOT NULL, "nombre" TEXT NOT NULL
);
CREATE TABLE "superficies_diente" (
  "fdi" INTEGER NOT NULL REFERENCES "dientes_ref"("fdi") ON UPDATE RESTRICT ON DELETE RESTRICT,
  "superficie" "Superficie" NOT NULL,
  PRIMARY KEY ("fdi", "superficie")
);
CREATE INDEX "sucursales_clinica_id_idx" ON "sucursales"("clinica_id");
CREATE INDEX "membresias_clinica_id_idx" ON "membresias"("clinica_id");
CREATE INDEX "membresias_usuario_id_idx" ON "membresias"("usuario_id");
CREATE INDEX "membresias_roles_gin_idx" ON "membresias" USING GIN ("roles");
CREATE INDEX "auditoria_clinica_id_idx" ON "auditoria"("clinica_id");

-- Usuarios es la excepción documentada: identidad global, acceso confinado a auth en 4B.
-- Las demás tablas de inquilino fallan cerradas sin los GUCs locales de tenant.ts.
ALTER TABLE "sucursales" ENABLE ROW LEVEL SECURITY; ALTER TABLE "sucursales" FORCE ROW LEVEL SECURITY;
ALTER TABLE "membresias" ENABLE ROW LEVEL SECURITY; ALTER TABLE "membresias" FORCE ROW LEVEL SECURITY;
ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY; ALTER TABLE "auditoria" FORCE ROW LEVEL SECURITY;
ALTER TABLE "clinicas" ENABLE ROW LEVEL SECURITY; ALTER TABLE "clinicas" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_sucursales" ON "sucursales" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "tenant_auditoria" ON "auditoria" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "membresia_visible" ON "membresias" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), '') OR "usuario_id" = NULLIF(current_setting('app.usuario_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "clinica_visible" ON "clinicas" TO clident_app, clident_readonly
  USING (
    "id" = NULLIF(current_setting('app.clinica_id', true), '')
    OR EXISTS (
      SELECT 1 FROM "membresias"
      WHERE "membresias"."clinica_id" = "clinicas"."id"
        AND "membresias"."usuario_id" = NULLIF(current_setting('app.usuario_id', true), '')
        AND "membresias"."activa" = true
    )
  )
  WITH CHECK ("id" = NULLIF(current_setting('app.clinica_id', true), ''));
-- El migrador no evade RLS: su política explícita solo existe fuera del runtime.
CREATE POLICY "migraciones_sucursales" ON "sucursales" TO clident_migrator USING (true) WITH CHECK (true);
CREATE POLICY "migraciones_membresias" ON "membresias" TO clident_migrator USING (true) WITH CHECK (true);
CREATE POLICY "migraciones_auditoria" ON "auditoria" TO clident_migrator USING (true) WITH CHECK (true);
CREATE POLICY "migraciones_clinicas" ON "clinicas" TO clident_migrator USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON "clinicas", "usuarios", "sucursales", "membresias" TO clident_app;
GRANT SELECT, INSERT ON "auditoria" TO clident_app;
GRANT SELECT ON "dientes_ref", "superficies_diente" TO clident_app;
GRANT SELECT ON "clinicas", "usuarios", "sucursales", "membresias", "auditoria", "dientes_ref", "superficies_diente" TO clident_readonly;
