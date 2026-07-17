-- Expediente clínico mínimo: relación 1:1 con Paciente y alertas trazables.
-- No introduce diagnósticos, odontograma, notas de consulta, tratamientos ni archivos.
CREATE TABLE "expedientes" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "paciente_id" TEXT NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "expedientes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expedientes_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "expedientes_clinica_id_paciente_id_fkey"
    FOREIGN KEY ("clinica_id", "paciente_id") REFERENCES "pacientes"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "expedientes_clinica_id_id_key" ON "expedientes"("clinica_id", "id");
CREATE UNIQUE INDEX "expedientes_clinica_id_paciente_id_key" ON "expedientes"("clinica_id", "paciente_id");

-- Los pacientes existentes conservan su fecha de creación. Reusar su id evita depender
-- de extensiones o generadores SQL para este backfill puramente 1:1.
INSERT INTO "expedientes" ("id", "clinica_id", "paciente_id", "creado_en", "actualizado_en")
SELECT "id", "clinica_id", "id", "creado_en", "actualizado_en"
FROM "pacientes";

CREATE TABLE "alertas_medicas" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "expediente_id" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "detalle" TEXT,
  "creada_por_id" TEXT NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "alertas_medicas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alertas_medicas_titulo_valido" CHECK (char_length(btrim("titulo")) BETWEEN 1 AND 160),
  CONSTRAINT "alertas_medicas_detalle_valido" CHECK ("detalle" IS NULL OR char_length("detalle") <= 1000),
  CONSTRAINT "alertas_medicas_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "alertas_medicas_clinica_id_expediente_id_fkey"
    FOREIGN KEY ("clinica_id", "expediente_id") REFERENCES "expedientes"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "alertas_medicas_clinica_id_creada_por_id_fkey"
    FOREIGN KEY ("clinica_id", "creada_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "alertas_medicas_clinica_id_id_key" ON "alertas_medicas"("clinica_id", "id");
CREATE INDEX "alertas_medicas_clinica_id_expediente_id_idx"
  ON "alertas_medicas"("clinica_id", "expediente_id");

-- Cerrar una alerta es un evento clínico separado. La unicidad impide dos cierres;
-- sin UPDATE ni DELETE para clident_app, reactivarla requeriría crear una alerta nueva.
CREATE TABLE "desactivaciones_alertas_medicas" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "alerta_id" TEXT NOT NULL,
  "desactivada_por_id" TEXT NOT NULL,
  "motivo_desactivacion" TEXT NOT NULL,
  "desactivada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "desactivaciones_alertas_medicas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "desactivaciones_alertas_medicas_motivo_valido"
    CHECK (char_length(btrim("motivo_desactivacion")) BETWEEN 1 AND 1000),
  CONSTRAINT "desactivaciones_alertas_medicas_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "desactivaciones_alertas_medicas_clinica_id_alerta_id_fkey"
    FOREIGN KEY ("clinica_id", "alerta_id") REFERENCES "alertas_medicas"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "desactivaciones_alertas_medicas_clinica_id_desactivada_por_id_fkey"
    FOREIGN KEY ("clinica_id", "desactivada_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "desactivaciones_alertas_medicas_clinica_id_id_key"
  ON "desactivaciones_alertas_medicas"("clinica_id", "id");
CREATE UNIQUE INDEX "desactivaciones_alertas_medicas_clinica_id_alerta_id_key"
  ON "desactivaciones_alertas_medicas"("clinica_id", "alerta_id");

ALTER TABLE "expedientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expedientes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "alertas_medicas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alertas_medicas" FORCE ROW LEVEL SECURITY;
ALTER TABLE "desactivaciones_alertas_medicas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "desactivaciones_alertas_medicas" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_expedientes" ON "expedientes" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_expedientes" ON "expedientes" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_alertas_medicas" ON "alertas_medicas" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_alertas_medicas" ON "alertas_medicas" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_desactivaciones_alertas_medicas" ON "desactivaciones_alertas_medicas" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_desactivaciones_alertas_medicas" ON "desactivaciones_alertas_medicas" TO clident_migrator
  USING (true) WITH CHECK (true);

-- Expediente es NORMAL. Alertas y cierres son APPEND_ONLY: no hay permiso de
-- reactivar, editar el motivo ni borrar historia clínica mediante la credencial runtime.
GRANT SELECT, INSERT, UPDATE ON "expedientes" TO clident_app;
GRANT SELECT ON "expedientes" TO clident_readonly;
GRANT SELECT, INSERT ON "alertas_medicas" TO clident_app;
GRANT SELECT ON "alertas_medicas" TO clident_readonly;
GRANT SELECT, INSERT ON "desactivaciones_alertas_medicas" TO clident_app;
GRANT SELECT ON "desactivaciones_alertas_medicas" TO clident_readonly;
