-- Fase 6: odontograma por eventos append-only + proyección derivada (ADR-005).
-- La historia clínica dental no tiene verbo UPDATE ni DELETE para clident_app:
-- las correcciones son eventos CONDICION_ANULADA que preservan el original.
-- La proyección estados_superficie sí es reescribible: es derivada y regenerable.

CREATE TYPE "TipoEventoOdontograma" AS ENUM (
  'CONDICION_REGISTRADA', 'TRATAMIENTO_INDICADO', 'PROCEDIMIENTO_REALIZADO', 'CONDICION_ANULADA'
);

CREATE TYPE "CondicionDental" AS ENUM (
  'SANO', 'CARIES', 'OBTURACION', 'CORONA', 'IMPLANTE', 'EXTRACCION_INDICADA',
  'AUSENTE', 'ENDODONCIA', 'PUENTE', 'PROTESIS', 'SELLANTE', 'FRACTURA',
  'MOVILIDAD', 'RECESION', 'ABSCESO', 'IMPACTADO'
);

CREATE TABLE "eventos_odontograma" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "paciente_id" TEXT NOT NULL,
  "fdi" INTEGER NOT NULL,
  "superficie" "Superficie" NOT NULL,
  "tipo" "TipoEventoOdontograma" NOT NULL,
  "condicion" "CondicionDental",
  "ocurrido_en" TIMESTAMPTZ(3) NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "registrado_por_id" TEXT NOT NULL,
  "diagnostico_id" TEXT,
  "anula_evento_id" TEXT,
  "motivo_anulacion" TEXT,

  CONSTRAINT "eventos_odontograma_pkey" PRIMARY KEY ("id"),
  -- Una anulación no lleva condición y siempre lleva objetivo y motivo; los
  -- demás tipos llevan condición y jamás campos de anulación. Sin estados mixtos.
  CONSTRAINT "eventos_odontograma_tipo_coherente" CHECK (
    ("tipo" = 'CONDICION_ANULADA' AND "condicion" IS NULL
      AND "anula_evento_id" IS NOT NULL AND "motivo_anulacion" IS NOT NULL
      AND char_length(btrim("motivo_anulacion")) BETWEEN 1 AND 1000)
    OR ("tipo" <> 'CONDICION_ANULADA' AND "condicion" IS NOT NULL
      AND "anula_evento_id" IS NULL AND "motivo_anulacion" IS NULL)
  ),
  CONSTRAINT "eventos_odontograma_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "eventos_odontograma_clinica_id_paciente_id_fkey"
    FOREIGN KEY ("clinica_id", "paciente_id") REFERENCES "pacientes"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "eventos_odontograma_fdi_superficie_fkey"
    FOREIGN KEY ("fdi", "superficie") REFERENCES "superficies_diente"("fdi", "superficie")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "eventos_odontograma_clinica_id_registrado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "registrado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "eventos_odontograma_clinica_id_diagnostico_id_fkey"
    FOREIGN KEY ("clinica_id", "diagnostico_id") REFERENCES "diagnosticos"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "eventos_odontograma_clinica_id_id_key"
  ON "eventos_odontograma"("clinica_id", "id");
-- Un evento solo puede anularse una vez; el segundo intento es conflicto de unicidad.
CREATE UNIQUE INDEX "eventos_odontograma_clinica_id_anula_evento_id_key"
  ON "eventos_odontograma"("clinica_id", "anula_evento_id");

-- La FK autorreferencial va DESPUÉS del índice único, no dentro del CREATE TABLE:
-- PostgreSQL exige que el destino de una FK ya tenga su restricción única, y una
-- tabla que se referencia a sí misma todavía no la tiene mientras se está creando.
-- (Detectado al aplicar contra PostgreSQL real: error 42830.)
ALTER TABLE "eventos_odontograma"
  ADD CONSTRAINT "eventos_odontograma_clinica_id_anula_evento_id_fkey"
  FOREIGN KEY ("clinica_id", "anula_evento_id") REFERENCES "eventos_odontograma"("clinica_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "eventos_odontograma_clinica_id_paciente_id_fdi_superficie_idx"
  ON "eventos_odontograma"("clinica_id", "paciente_id", "fdi", "superficie");
CREATE INDEX "eventos_odontograma_clinica_id_paciente_id_idx"
  ON "eventos_odontograma"("clinica_id", "paciente_id");

CREATE TABLE "estados_superficie" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "paciente_id" TEXT NOT NULL,
  "fdi" INTEGER NOT NULL,
  "superficie" "Superficie" NOT NULL,
  "condicion" "CondicionDental" NOT NULL,
  "tratamiento_pendiente" BOOLEAN NOT NULL,
  "ultimo_evento_id" TEXT NOT NULL,
  "ultimo_evento_en" TIMESTAMPTZ(3) NOT NULL,
  "ultimo_evento_creado_en" TIMESTAMPTZ(3) NOT NULL,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "estados_superficie_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "estados_superficie_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "estados_superficie_clinica_id_paciente_id_fkey"
    FOREIGN KEY ("clinica_id", "paciente_id") REFERENCES "pacientes"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "estados_superficie_fdi_superficie_fkey"
    FOREIGN KEY ("fdi", "superficie") REFERENCES "superficies_diente"("fdi", "superficie")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "estados_superficie_clinica_id_ultimo_evento_id_fkey"
    FOREIGN KEY ("clinica_id", "ultimo_evento_id") REFERENCES "eventos_odontograma"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "estados_superficie_clinica_id_id_key"
  ON "estados_superficie"("clinica_id", "id");
-- El centinela COMPLETO (en vez de superficie nulable) mantiene esta unicidad
-- realmente única: en PostgreSQL los NULL no colisionan entre sí.
CREATE UNIQUE INDEX "estados_superficie_clinica_id_paciente_id_fdi_superficie_key"
  ON "estados_superficie"("clinica_id", "paciente_id", "fdi", "superficie");
CREATE INDEX "estados_superficie_clinica_id_paciente_id_idx"
  ON "estados_superficie"("clinica_id", "paciente_id");

ALTER TABLE "eventos_odontograma" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_odontograma" FORCE ROW LEVEL SECURITY;
ALTER TABLE "estados_superficie" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "estados_superficie" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_eventos_odontograma" ON "eventos_odontograma" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_eventos_odontograma" ON "eventos_odontograma" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_estados_superficie" ON "estados_superficie" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_estados_superficie" ON "estados_superficie" TO clident_migrator
  USING (true) WITH CHECK (true);

-- eventos_odontograma es APPEND_ONLY: la base rechaza el borrado y la edición
-- de historia clínica a nivel de privilegios, no de convención (ADR-012).
-- estados_superficie es PROYECCION_DERIVADA: reescribible porque se regenera.
GRANT SELECT, INSERT ON "eventos_odontograma" TO clident_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "estados_superficie" TO clident_app;
GRANT SELECT ON "eventos_odontograma", "estados_superficie" TO clident_readonly;
