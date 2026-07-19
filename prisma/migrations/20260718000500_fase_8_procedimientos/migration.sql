-- Fase 8: procedimientos realizados. El hecho clínico ocurrido (§10.5).
-- "Inmutable" es un privilegio de PostgreSQL, no una convención: procedimientos
-- nace PARCIALMENTE_INMUTABLE (REVOKE de tabla + GRANT por columna, §4.2.2),
-- los dientes del procedimiento y las enmiendas nacen APPEND_ONLY.
-- Realizar un procedimiento NO crea ningún cargo (ADR-007).

CREATE TYPE "EstadoProcedimiento" AS ENUM ('REALIZADO', 'ANULADO');

CREATE TABLE "procedimientos" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "sucursal_id" TEXT NOT NULL,
  "paciente_id" TEXT NOT NULL,
  "plan_item_id" TEXT NOT NULL,
  "odontologo_id" TEXT NOT NULL,
  "tratamiento_id" TEXT NOT NULL,
  "tratamiento_codigo" TEXT NOT NULL,
  "tratamiento_nombre" TEXT NOT NULL,
  "realizado_en" TIMESTAMPTZ(3) NOT NULL,
  "precio_aplicado_centavos" INTEGER NOT NULL,
  "estado" "EstadoProcedimiento" NOT NULL DEFAULT 'REALIZADO',
  "notas_clinicas" TEXT,
  "anulado_en" TIMESTAMPTZ(3),
  "anulado_por_id" TEXT,
  "motivo_anulacion" TEXT,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "creado_por_id" TEXT NOT NULL,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "procedimientos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procedimientos_precio_no_negativo" CHECK ("precio_aplicado_centavos" >= 0),
  CONSTRAINT "procedimientos_notas_validas"
    CHECK ("notas_clinicas" IS NULL OR char_length("notas_clinicas") <= 5000),
  -- La lista canónica de §10.5: anulado a medias no existe.
  CONSTRAINT "procedimiento_estado_coherente" CHECK (
    ("anulado_en" IS NULL AND "estado" <> 'ANULADO')
    OR ("anulado_en" IS NOT NULL AND "estado" = 'ANULADO'
        AND "anulado_por_id" IS NOT NULL AND "motivo_anulacion" IS NOT NULL
        AND char_length(btrim("motivo_anulacion")) BETWEEN 1 AND 1000)
  ),
  CONSTRAINT "procedimientos_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "procedimientos_clinica_id_sucursal_id_fkey"
    FOREIGN KEY ("clinica_id", "sucursal_id") REFERENCES "sucursales"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "procedimientos_clinica_id_paciente_id_fkey"
    FOREIGN KEY ("clinica_id", "paciente_id") REFERENCES "pacientes"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "procedimientos_clinica_id_plan_item_id_fkey"
    FOREIGN KEY ("clinica_id", "plan_item_id") REFERENCES "plan_items"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "procedimientos_clinica_id_odontologo_id_fkey"
    FOREIGN KEY ("clinica_id", "odontologo_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "procedimientos_clinica_id_tratamiento_id_fkey"
    FOREIGN KEY ("clinica_id", "tratamiento_id") REFERENCES "tratamientos"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "procedimientos_clinica_id_creado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "creado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "procedimientos_clinica_id_anulado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "anulado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "procedimientos_clinica_id_id_key" ON "procedimientos"("clinica_id", "id");
CREATE INDEX "procedimientos_clinica_id_paciente_id_idx"
  ON "procedimientos"("clinica_id", "paciente_id");
CREATE INDEX "procedimientos_clinica_id_plan_item_id_idx"
  ON "procedimientos"("clinica_id", "plan_item_id");

CREATE TABLE "procedimiento_dientes" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "procedimiento_id" TEXT NOT NULL,
  "fdi" INTEGER NOT NULL,
  "superficie" "Superficie" NOT NULL,

  CONSTRAINT "procedimiento_dientes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procedimiento_dientes_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- RESTRICT, no CASCADE: esto NO es un puente editable — es un hecho (§3.4).
  CONSTRAINT "procedimiento_dientes_clinica_id_procedimiento_id_fkey"
    FOREIGN KEY ("clinica_id", "procedimiento_id") REFERENCES "procedimientos"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "procedimiento_dientes_fdi_superficie_fkey"
    FOREIGN KEY ("fdi", "superficie") REFERENCES "superficies_diente"("fdi", "superficie")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "procedimiento_dientes_clinica_id_id_key"
  ON "procedimiento_dientes"("clinica_id", "id");
CREATE UNIQUE INDEX "procedimiento_dientes_clinica_id_procedimiento_id_fdi_superficie_key"
  ON "procedimiento_dientes"("clinica_id", "procedimiento_id", "fdi", "superficie");
CREATE INDEX "procedimiento_dientes_clinica_id_procedimiento_id_idx"
  ON "procedimiento_dientes"("clinica_id", "procedimiento_id");

CREATE TABLE "enmiendas_procedimiento" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "procedimiento_id" TEXT NOT NULL,
  "texto_anterior" TEXT,
  "texto_nuevo" TEXT NOT NULL,
  "motivo" TEXT NOT NULL,
  "creada_por_id" TEXT NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "enmiendas_procedimiento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "enmiendas_texto_nuevo_valido"
    CHECK (char_length(btrim("texto_nuevo")) BETWEEN 1 AND 5000),
  CONSTRAINT "enmiendas_motivo_valido"
    CHECK (char_length(btrim("motivo")) BETWEEN 1 AND 1000),
  CONSTRAINT "enmiendas_procedimiento_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "enmiendas_procedimiento_clinica_id_procedimiento_id_fkey"
    FOREIGN KEY ("clinica_id", "procedimiento_id") REFERENCES "procedimientos"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "enmiendas_procedimiento_clinica_id_creada_por_id_fkey"
    FOREIGN KEY ("clinica_id", "creada_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "enmiendas_procedimiento_clinica_id_id_key"
  ON "enmiendas_procedimiento"("clinica_id", "id");
CREATE INDEX "enmiendas_procedimiento_clinica_id_procedimiento_id_idx"
  ON "enmiendas_procedimiento"("clinica_id", "procedimiento_id");

-- El odontograma gana la procedencia del procedimiento: el evento
-- PROCEDIMIENTO_REALIZADO sabe de qué hecho clínico salió, y la anulación
-- compensatoria encuentra sus eventos por esta columna.
ALTER TABLE "eventos_odontograma" ADD COLUMN "procedimiento_id" TEXT;
ALTER TABLE "eventos_odontograma"
  ADD CONSTRAINT "eventos_odontograma_clinica_id_procedimiento_id_fkey"
  FOREIGN KEY ("clinica_id", "procedimiento_id") REFERENCES "procedimientos"("clinica_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "eventos_odontograma_clinica_id_procedimiento_id_idx"
  ON "eventos_odontograma"("clinica_id", "procedimiento_id");

ALTER TABLE "procedimientos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procedimientos" FORCE ROW LEVEL SECURITY;
ALTER TABLE "procedimiento_dientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procedimiento_dientes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "enmiendas_procedimiento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enmiendas_procedimiento" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_procedimientos" ON "procedimientos" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_procedimientos" ON "procedimientos" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_procedimiento_dientes" ON "procedimiento_dientes" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_procedimiento_dientes" ON "procedimiento_dientes" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_enmiendas_procedimiento" ON "enmiendas_procedimiento" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_enmiendas_procedimiento" ON "enmiendas_procedimiento" TO clident_migrator
  USING (true) WITH CHECK (true);

-- §4.2.2: 1º REVOCAR de tabla. 2º CONCEDER por columna. NUNCA al revés.
-- (En una tabla nueva el REVOKE es un no-op, pero el orden documentado se
-- respeta para que este bloque sea copiable sin pensar.)
GRANT SELECT, INSERT ON "procedimientos" TO clident_app;
REVOKE UPDATE ON "procedimientos" FROM clident_app;
GRANT UPDATE ("estado", "notas_clinicas", "anulado_en", "anulado_por_id",
              "motivo_anulacion", "actualizado_en")
  ON "procedimientos" TO clident_app;

-- APPEND_ONLY: ni UPDATE ni DELETE. Los dientes de un procedimiento y las
-- enmiendas son hechos; la base rechaza reescribirlos.
GRANT SELECT, INSERT ON "procedimiento_dientes" TO clident_app;
GRANT SELECT, INSERT ON "enmiendas_procedimiento" TO clident_app;

GRANT SELECT ON "procedimientos", "procedimiento_dientes", "enmiendas_procedimiento"
  TO clident_readonly;
