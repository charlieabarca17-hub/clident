-- Fase 4: catálogo de tratamientos.
-- Plantillas globales (REFERENCIA_GLOBAL, solo lectura para la app) y catálogo
-- por clínica (NORMAL: sin DELETE — un tratamiento se desactiva, nunca se borra).
-- El catálogo NO tiene columna de superficie (REGLAS-DE-NEGOCIO §4.7): la
-- garantía es estructural, no hay dónde escribir "resina oclusal".

CREATE TYPE "AlcanceTratamiento" AS ENUM ('DIENTE', 'BOCA');

-- ── Plantillas de plataforma (globales, sin clinica_id ni RLS, como dientes_ref) ──

CREATE TABLE "plantillas_categoria" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "orden" INTEGER NOT NULL,

  CONSTRAINT "plantillas_categoria_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plantillas_categoria_nombre_valido"
    CHECK (char_length(btrim("nombre")) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX "plantillas_categoria_orden_key" ON "plantillas_categoria"("orden");

-- Las banderas de comportamiento deben ser coherentes entre sí; el CHECK vive en
-- la base para que ni la semilla ni una clínica puedan crear combinaciones sin
-- sentido (superficies sin diente, múltiples dientes en un tratamiento de boca).
CREATE TABLE "plantillas_tratamiento" (
  "codigo" TEXT NOT NULL,
  "categoria_id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "precio_sugerido_centavos" INTEGER NOT NULL,
  "alcance" "AlcanceTratamiento" NOT NULL,
  "requiere_diente" BOOLEAN NOT NULL,
  "permite_multiples_dientes" BOOLEAN NOT NULL,
  "permite_superficies" BOOLEAN NOT NULL,
  "permite_multiples_superficies" BOOLEAN NOT NULL,
  "requiere_diagnostico" BOOLEAN NOT NULL,
  "permite_multiples_sesiones" BOOLEAN NOT NULL,

  CONSTRAINT "plantillas_tratamiento_pkey" PRIMARY KEY ("codigo"),
  CONSTRAINT "plantillas_tratamiento_codigo_valido"
    CHECK (char_length(btrim("codigo")) BETWEEN 1 AND 20),
  CONSTRAINT "plantillas_tratamiento_nombre_valido"
    CHECK (char_length(btrim("nombre")) BETWEEN 1 AND 120),
  CONSTRAINT "plantillas_tratamiento_precio_no_negativo"
    CHECK ("precio_sugerido_centavos" >= 0),
  CONSTRAINT "plantillas_tratamiento_banderas_coherentes" CHECK (
    (NOT "permite_multiples_superficies" OR "permite_superficies")
    AND (NOT "permite_superficies" OR "requiere_diente")
    AND (NOT "permite_multiples_dientes" OR "requiere_diente")
    AND ("alcance" <> 'BOCA' OR NOT "requiere_diente")
  ),
  CONSTRAINT "plantillas_tratamiento_categoria_id_fkey"
    FOREIGN KEY ("categoria_id") REFERENCES "plantillas_categoria"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- ── Catálogo por clínica ──

CREATE TABLE "categorias_tratamiento" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "orden" INTEGER NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "categorias_tratamiento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "categorias_tratamiento_nombre_valido"
    CHECK (char_length(btrim("nombre")) BETWEEN 1 AND 80),
  CONSTRAINT "categorias_tratamiento_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "categorias_tratamiento_clinica_id_id_key"
  ON "categorias_tratamiento"("clinica_id", "id");
CREATE UNIQUE INDEX "categorias_tratamiento_clinica_id_nombre_key"
  ON "categorias_tratamiento"("clinica_id", "nombre");
CREATE INDEX "categorias_tratamiento_clinica_id_idx"
  ON "categorias_tratamiento"("clinica_id");

CREATE TABLE "tratamientos" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "categoria_id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "precio_lista_centavos" INTEGER NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "alcance" "AlcanceTratamiento" NOT NULL,
  "requiere_diente" BOOLEAN NOT NULL,
  "permite_multiples_dientes" BOOLEAN NOT NULL,
  "permite_superficies" BOOLEAN NOT NULL,
  "permite_multiples_superficies" BOOLEAN NOT NULL,
  "requiere_diagnostico" BOOLEAN NOT NULL,
  "permite_multiples_sesiones" BOOLEAN NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "tratamientos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tratamientos_codigo_valido"
    CHECK (char_length(btrim("codigo")) BETWEEN 1 AND 20),
  CONSTRAINT "tratamientos_nombre_valido"
    CHECK (char_length(btrim("nombre")) BETWEEN 1 AND 120),
  CONSTRAINT "tratamientos_precio_no_negativo"
    CHECK ("precio_lista_centavos" >= 0),
  CONSTRAINT "tratamientos_banderas_coherentes" CHECK (
    (NOT "permite_multiples_superficies" OR "permite_superficies")
    AND (NOT "permite_superficies" OR "requiere_diente")
    AND (NOT "permite_multiples_dientes" OR "requiere_diente")
    AND ("alcance" <> 'BOCA' OR NOT "requiere_diente")
  ),
  CONSTRAINT "tratamientos_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "tratamientos_clinica_id_categoria_id_fkey"
    FOREIGN KEY ("clinica_id", "categoria_id")
    REFERENCES "categorias_tratamiento"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "tratamientos_clinica_id_id_key" ON "tratamientos"("clinica_id", "id");
CREATE UNIQUE INDEX "tratamientos_clinica_id_codigo_key" ON "tratamientos"("clinica_id", "codigo");
CREATE INDEX "tratamientos_clinica_id_categoria_id_idx"
  ON "tratamientos"("clinica_id", "categoria_id");

-- ── RLS: solo las tablas de inquilino. Las plantillas son globales por diseño. ──

ALTER TABLE "categorias_tratamiento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categorias_tratamiento" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tratamientos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tratamientos" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_categorias_tratamiento" ON "categorias_tratamiento" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_categorias_tratamiento" ON "categorias_tratamiento" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_tratamientos" ON "tratamientos" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_tratamientos" ON "tratamientos" TO clident_migrator
  USING (true) WITH CHECK (true);

-- ── Privilegios por clase (ADR-012). Sin DELETE en ninguna. ──

GRANT SELECT ON "plantillas_categoria", "plantillas_tratamiento" TO clident_app;
GRANT SELECT, INSERT, UPDATE ON "categorias_tratamiento", "tratamientos" TO clident_app;
GRANT SELECT ON "plantillas_categoria", "plantillas_tratamiento",
  "categorias_tratamiento", "tratamientos" TO clident_readonly;
