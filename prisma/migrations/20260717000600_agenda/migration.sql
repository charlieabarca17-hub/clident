-- Agenda: coordinación administrativa. No enlaza catálogo, plan ni procedimiento.
-- PostgreSQL, no la UI, resuelve los solapamientos (ADR-008).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "EstadoCita" AS ENUM ('PENDIENTE', 'CANCELADA');

CREATE TABLE "citas" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "sucursal_id" TEXT NOT NULL,
  "paciente_id" TEXT NOT NULL,
  "odontologo_id" TEXT NOT NULL,
  "inicio_en" TIMESTAMPTZ(3) NOT NULL,
  "fin_en" TIMESTAMPTZ(3) NOT NULL,
  "estado" "EstadoCita" NOT NULL DEFAULT 'PENDIENTE',
  "motivo" TEXT,
  "notas_administrativas" TEXT,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "citas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "citas_rango_valido" CHECK ("fin_en" > "inicio_en"),
  CONSTRAINT "citas_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "citas_clinica_id_sucursal_id_fkey"
    FOREIGN KEY ("clinica_id", "sucursal_id") REFERENCES "sucursales"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "citas_clinica_id_paciente_id_fkey"
    FOREIGN KEY ("clinica_id", "paciente_id") REFERENCES "pacientes"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "citas_clinica_id_odontologo_id_fkey"
    FOREIGN KEY ("clinica_id", "odontologo_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "citas_clinica_id_id_key" ON "citas"("clinica_id", "id");
CREATE INDEX "citas_clinica_id_inicio_en_idx" ON "citas"("clinica_id", "inicio_en");
CREATE INDEX "citas_clinica_id_paciente_id_idx" ON "citas"("clinica_id", "paciente_id");
CREATE INDEX "citas_clinica_id_odontologo_id_idx" ON "citas"("clinica_id", "odontologo_id");

-- Rangos medio abiertos: 09:00-10:00 y 10:00-11:00 son consecutivos, no conflicto.
-- No se incluye sucursal: una persona no puede estar en dos sedes simultáneamente.
ALTER TABLE "citas" ADD CONSTRAINT "citas_sin_traslape"
  EXCLUDE USING gist (
    "clinica_id" WITH =,
    "odontologo_id" WITH =,
    tstzrange("inicio_en", "fin_en", '[)') WITH &&
  ) WHERE ("estado" <> 'CANCELADA');

ALTER TABLE "citas" ADD CONSTRAINT "citas_paciente_sin_traslape"
  EXCLUDE USING gist (
    "clinica_id" WITH =,
    "paciente_id" WITH =,
    tstzrange("inicio_en", "fin_en", '[)') WITH &&
  ) WHERE ("estado" <> 'CANCELADA');

ALTER TABLE "citas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "citas" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_citas" ON "citas" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));

-- El migrador no tiene BYPASSRLS: esta es su única política explícita.
CREATE POLICY "migraciones_citas" ON "citas" TO clident_migrator
  USING (true) WITH CHECK (true);

-- Clase NORMAL (ADR-012): se puede cancelar o reprogramar, nunca borrar.
GRANT SELECT, INSERT, UPDATE ON "citas" TO clident_app;
GRANT SELECT ON "citas" TO clident_readonly;
