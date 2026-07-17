-- Paciente base: identidad clínica mínima para Agenda, sin expediente clínico.
-- El DUI se enmascara en PostgreSQL para que los listados nunca reciban el valor completo.
CREATE TYPE "TipoDocumentoResponsable" AS ENUM ('DUI', 'PASAPORTE', 'CARNET_RESIDENTE');

CREATE TABLE "pacientes" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "nombres" TEXT NOT NULL,
  "apellidos" TEXT NOT NULL,
  "fecha_nacimiento" DATE NOT NULL,
  "dui" TEXT,
  "dui_enmascarado" TEXT GENERATED ALWAYS AS (
    CASE WHEN "dui" IS NULL THEN NULL ELSE '********-' || right("dui", 1) END
  ) STORED,
  "telefono" TEXT NOT NULL,
  "correo" TEXT,
  "direccion" TEXT,
  "responsable_nombre" TEXT,
  "responsable_tipo_documento" "TipoDocumentoResponsable",
  "responsable_num_documento" TEXT,
  "responsable_telefono" TEXT,
  "responsable_parentesco" TEXT,
  "contacto_emergencia_nombre" TEXT NOT NULL,
  "contacto_emergencia_telefono" TEXT NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pacientes_dui_formato" CHECK (
    "dui" IS NULL OR "dui" ~ '^[0-9]{8}-[0-9]$'
  ),
  CONSTRAINT "pacientes_responsable_completo" CHECK (
    (
      "responsable_nombre" IS NULL
      AND "responsable_tipo_documento" IS NULL
      AND "responsable_num_documento" IS NULL
      AND "responsable_telefono" IS NULL
      AND "responsable_parentesco" IS NULL
    ) OR (
      "responsable_nombre" IS NOT NULL
      AND "responsable_tipo_documento" IS NOT NULL
      AND "responsable_num_documento" IS NOT NULL
      AND "responsable_telefono" IS NOT NULL
      AND "responsable_parentesco" IS NOT NULL
    )
  ),
  CONSTRAINT "pacientes_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "pacientes_clinica_id_id_key" ON "pacientes"("clinica_id", "id");
CREATE UNIQUE INDEX "pacientes_clinica_id_dui_key" ON "pacientes"("clinica_id", "dui");
CREATE INDEX "pacientes_clinica_id_apellidos_nombres_idx"
  ON "pacientes"("clinica_id", "apellidos", "nombres");
CREATE INDEX "pacientes_clinica_id_telefono_idx" ON "pacientes"("clinica_id", "telefono");

ALTER TABLE "pacientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pacientes" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_pacientes" ON "pacientes" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));

-- El migrador no evade RLS; su política explícita nunca existe en runtime.
CREATE POLICY "migraciones_pacientes" ON "pacientes" TO clident_migrator
  USING (true) WITH CHECK (true);

-- Clase NORMAL (ADR-012): lectura, inserción y actualización; nunca DELETE.
GRANT SELECT, INSERT, UPDATE ON "pacientes" TO clident_app;
GRANT SELECT ON "pacientes" TO clident_readonly;
