-- Catálogo seleccionado por clínica, sin precios impuestos, alias personales y
-- sincronización opcional de citas con un calendario secundario de Google.

CREATE TYPE "EstadoSincronizacionCalendario" AS ENUM
  ('PENDIENTE', 'SINCRONIZADA', 'ERROR', 'CANCELADA');

-- Las filas existentes se vinculan a su referencia cuando el código coincide.
-- Los tratamientos personalizados quedan con plantilla_codigo NULL.
ALTER TABLE "tratamientos" ADD COLUMN "plantilla_codigo" TEXT;
UPDATE "tratamientos" t
SET "plantilla_codigo" = p."codigo"
FROM "plantillas_tratamiento" p
WHERE p."codigo" = t."codigo";

ALTER TABLE "tratamientos"
  ADD CONSTRAINT "tratamientos_plantilla_codigo_fkey"
  FOREIGN KEY ("plantilla_codigo") REFERENCES "plantillas_tratamiento"("codigo")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "tratamientos_plantilla_codigo_idx" ON "tratamientos"("plantilla_codigo");

-- El catálogo deja de contener precios. El único precio clínicamente vinculante
-- nace en plan_items al preparar el plan de un paciente.
ALTER TABLE "tratamientos" DROP CONSTRAINT "tratamientos_precio_no_negativo";
ALTER TABLE "tratamientos" DROP COLUMN "precio_lista_centavos";
ALTER TABLE "plantillas_tratamiento"
  DROP CONSTRAINT "plantillas_tratamiento_precio_no_negativo";
ALTER TABLE "plantillas_tratamiento" DROP COLUMN "precio_sugerido_centavos";

CREATE TABLE "preferencias_tratamiento" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "membresia_id" TEXT NOT NULL,
  "tratamiento_id" TEXT NOT NULL,
  "alias" TEXT,
  "favorito" BOOLEAN NOT NULL DEFAULT false,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "preferencias_tratamiento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "preferencias_tratamiento_alias_valido"
    CHECK ("alias" IS NULL OR char_length(btrim("alias")) BETWEEN 1 AND 120),
  CONSTRAINT "preferencias_tratamiento_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "preferencias_tratamiento_membresia_fkey"
    FOREIGN KEY ("clinica_id", "membresia_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "preferencias_tratamiento_tratamiento_fkey"
    FOREIGN KEY ("clinica_id", "tratamiento_id") REFERENCES "tratamientos"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "preferencias_tratamiento_clinica_id_id_key"
  ON "preferencias_tratamiento"("clinica_id", "id");
CREATE UNIQUE INDEX "preferencias_tratamiento_clinica_membresia_tratamiento_key"
  ON "preferencias_tratamiento"("clinica_id", "membresia_id", "tratamiento_id");
CREATE INDEX "preferencias_tratamiento_clinica_tratamiento_idx"
  ON "preferencias_tratamiento"("clinica_id", "tratamiento_id");

CREATE TABLE "conexiones_google_calendar" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "membresia_id" TEXT NOT NULL,
  "correo_google" TEXT NOT NULL,
  "refresh_token_cifrado" TEXT NOT NULL,
  "calendario_id" TEXT NOT NULL,
  "calendario_nombre" TEXT NOT NULL DEFAULT 'CLIDENT',
  "scopes" TEXT[] NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "conectado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "conexiones_google_calendar_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conexiones_google_calendar_correo_valido"
    CHECK (char_length(btrim("correo_google")) BETWEEN 3 AND 320),
  CONSTRAINT "conexiones_google_calendar_token_valido"
    CHECK (char_length("refresh_token_cifrado") >= 32),
  CONSTRAINT "conexiones_google_calendar_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "conexiones_google_calendar_membresia_fkey"
    FOREIGN KEY ("clinica_id", "membresia_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "conexiones_google_calendar_clinica_id_id_key"
  ON "conexiones_google_calendar"("clinica_id", "id");
CREATE UNIQUE INDEX "conexiones_google_calendar_clinica_membresia_key"
  ON "conexiones_google_calendar"("clinica_id", "membresia_id");
CREATE INDEX "conexiones_google_calendar_clinica_id_idx"
  ON "conexiones_google_calendar"("clinica_id");

CREATE TABLE "sincronizaciones_cita_google" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "cita_id" TEXT NOT NULL,
  "conexion_id" TEXT NOT NULL,
  "google_evento_id" TEXT NOT NULL,
  "estado" "EstadoSincronizacionCalendario" NOT NULL DEFAULT 'PENDIENTE',
  "ultimo_error" TEXT,
  "sincronizado_en" TIMESTAMPTZ(3),
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sincronizaciones_cita_google_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sincronizaciones_cita_google_error_valido"
    CHECK ("ultimo_error" IS NULL OR char_length("ultimo_error") <= 1000),
  CONSTRAINT "sincronizaciones_cita_google_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "sincronizaciones_cita_google_cita_fkey"
    FOREIGN KEY ("clinica_id", "cita_id") REFERENCES "citas"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "sincronizaciones_cita_google_conexion_fkey"
    FOREIGN KEY ("clinica_id", "conexion_id") REFERENCES "conexiones_google_calendar"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "sincronizaciones_cita_google_clinica_id_id_key"
  ON "sincronizaciones_cita_google"("clinica_id", "id");
CREATE UNIQUE INDEX "sincronizaciones_cita_google_cita_conexion_key"
  ON "sincronizaciones_cita_google"("clinica_id", "cita_id", "conexion_id");
CREATE UNIQUE INDEX "sincronizaciones_cita_google_conexion_evento_key"
  ON "sincronizaciones_cita_google"("conexion_id", "google_evento_id");
CREATE INDEX "sincronizaciones_cita_google_clinica_cita_idx"
  ON "sincronizaciones_cita_google"("clinica_id", "cita_id");

ALTER TABLE "preferencias_tratamiento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "preferencias_tratamiento" FORCE ROW LEVEL SECURITY;
ALTER TABLE "conexiones_google_calendar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conexiones_google_calendar" FORCE ROW LEVEL SECURITY;
ALTER TABLE "sincronizaciones_cita_google" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sincronizaciones_cita_google" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_preferencias_tratamiento" ON "preferencias_tratamiento" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_preferencias_tratamiento" ON "preferencias_tratamiento" TO clident_migrator
  USING (true) WITH CHECK (true);
CREATE POLICY "tenant_conexiones_google_calendar" ON "conexiones_google_calendar" TO clident_app
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_conexiones_google_calendar" ON "conexiones_google_calendar" TO clident_migrator
  USING (true) WITH CHECK (true);
CREATE POLICY "tenant_sincronizaciones_cita_google" ON "sincronizaciones_cita_google" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_sincronizaciones_cita_google" ON "sincronizaciones_cita_google" TO clident_migrator
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON "preferencias_tratamiento",
  "conexiones_google_calendar", "sincronizaciones_cita_google" TO clident_app;
GRANT SELECT ON "preferencias_tratamiento", "sincronizaciones_cita_google" TO clident_readonly;

-- Deliberadamente no se concede acceso de solo lectura a la conexión: contiene
-- el refresh token cifrado y no forma parte de ningún reporte clínico.
