-- Fase 5: diagnósticos, separados de los tratamientos (REGLAS §4.1).
-- Un diagnóstico genera 0, 1 o muchos tratamientos; nunca relación 1:1.
-- Se anula con motivo (CHECK todo-o-nada); jamás se borra: clident_app no
-- recibe DELETE sobre diagnosticos. El puente diagnostico_dientes es la única
-- tabla nueva con DELETE legítimo (clase PUENTE_EDITABLE, ADR-012).

CREATE TYPE "AlcanceDiagnostico" AS ENUM ('DIENTE', 'PACIENTE');

CREATE TABLE "diagnosticos" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "expediente_id" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "notas" TEXT,
  "alcance" "AlcanceDiagnostico" NOT NULL,
  "registrado_por_id" TEXT NOT NULL,
  "anulado_en" TIMESTAMPTZ(3),
  "anulado_por_id" TEXT,
  "motivo_anulacion" TEXT,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "diagnosticos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "diagnosticos_descripcion_valida"
    CHECK (char_length(btrim("descripcion")) BETWEEN 1 AND 300),
  CONSTRAINT "diagnosticos_notas_validas"
    CHECK ("notas" IS NULL OR char_length("notas") <= 2000),
  -- La anulación es todo o nada: no existe un diagnóstico "a medio anular".
  CONSTRAINT "diagnosticos_anulacion_coherente" CHECK (
    ("anulado_en" IS NULL AND "anulado_por_id" IS NULL AND "motivo_anulacion" IS NULL)
    OR ("anulado_en" IS NOT NULL AND "anulado_por_id" IS NOT NULL
        AND "motivo_anulacion" IS NOT NULL
        AND char_length(btrim("motivo_anulacion")) BETWEEN 1 AND 1000)
  ),
  CONSTRAINT "diagnosticos_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "diagnosticos_clinica_id_expediente_id_fkey"
    FOREIGN KEY ("clinica_id", "expediente_id") REFERENCES "expedientes"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "diagnosticos_clinica_id_registrado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "registrado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "diagnosticos_clinica_id_anulado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "anulado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "diagnosticos_clinica_id_id_key" ON "diagnosticos"("clinica_id", "id");
CREATE INDEX "diagnosticos_clinica_id_expediente_id_idx"
  ON "diagnosticos"("clinica_id", "expediente_id");

-- La FK a superficies_diente hace imposible registrar una cara que la pieza no
-- tiene: "caries oclusal en el 11" no existe como fila posible (§10.2).
CREATE TABLE "diagnostico_dientes" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "diagnostico_id" TEXT NOT NULL,
  "fdi" INTEGER NOT NULL,
  "superficie" "Superficie" NOT NULL,

  CONSTRAINT "diagnostico_dientes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "diagnostico_dientes_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- Cascade permitido SOLO en puentes de dientes de entidades editables (§3.4).
  CONSTRAINT "diagnostico_dientes_clinica_id_diagnostico_id_fkey"
    FOREIGN KEY ("clinica_id", "diagnostico_id") REFERENCES "diagnosticos"("clinica_id", "id")
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "diagnostico_dientes_fdi_superficie_fkey"
    FOREIGN KEY ("fdi", "superficie") REFERENCES "superficies_diente"("fdi", "superficie")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "diagnostico_dientes_clinica_id_id_key"
  ON "diagnostico_dientes"("clinica_id", "id");
CREATE UNIQUE INDEX "diagnostico_dientes_clinica_id_diagnostico_id_fdi_superficie_key"
  ON "diagnostico_dientes"("clinica_id", "diagnostico_id", "fdi", "superficie");
CREATE INDEX "diagnostico_dientes_clinica_id_diagnostico_id_idx"
  ON "diagnostico_dientes"("clinica_id", "diagnostico_id");

ALTER TABLE "diagnosticos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "diagnosticos" FORCE ROW LEVEL SECURITY;
ALTER TABLE "diagnostico_dientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "diagnostico_dientes" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_diagnosticos" ON "diagnosticos" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_diagnosticos" ON "diagnosticos" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_diagnostico_dientes" ON "diagnostico_dientes" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_diagnostico_dientes" ON "diagnostico_dientes" TO clident_migrator
  USING (true) WITH CHECK (true);

-- diagnosticos es NORMAL (sin DELETE). diagnostico_dientes es PUENTE_EDITABLE:
-- editar los dientes es delete+insert, sin UPDATE (ADR-012).
GRANT SELECT, INSERT, UPDATE ON "diagnosticos" TO clident_app;
GRANT SELECT, INSERT, DELETE ON "diagnostico_dientes" TO clident_app;
GRANT SELECT ON "diagnosticos", "diagnostico_dientes" TO clident_readonly;
