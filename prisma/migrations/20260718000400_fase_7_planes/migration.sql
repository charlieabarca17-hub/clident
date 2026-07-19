-- Fase 7: planes de tratamiento (ADR-014) con precio congelado (ADR-006).
-- Aceptar un plan NUNCA crea cargos (ADR-007): la cuenta por cobrar nace solo
-- en Caja. plan_items es la tercera tabla de dinero y nace PARCIALMENTE_INMUTABLE:
-- el precio que el paciente vio no lo puede reescribir ni un UPDATE directo.

CREATE TYPE "EstadoPlan" AS ENUM ('BORRADOR', 'PRESENTADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO');
CREATE TYPE "EstadoPlanItem" AS ENUM (
  'PROPUESTO', 'ACEPTADO', 'EN_PROCESO', 'COMPLETADO', 'CANCELADO', 'ANULADO'
);

CREATE TABLE "planes" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "paciente_id" TEXT NOT NULL,
  "titulo" TEXT,
  "estado" "EstadoPlan" NOT NULL DEFAULT 'BORRADOR',
  "creado_por_id" TEXT NOT NULL,
  "presentado_en" TIMESTAMPTZ(3),
  "aceptado_en" TIMESTAMPTZ(3),
  "rechazado_en" TIMESTAMPTZ(3),
  "anulado_en" TIMESTAMPTZ(3),
  "anulado_por_id" TEXT,
  "motivo_anulacion" TEXT,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "planes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "planes_titulo_valido"
    CHECK ("titulo" IS NULL OR char_length(btrim("titulo")) BETWEEN 1 AND 160),
  -- Un estado que afirma un hecho exige su fecha. (La transición inversa no la
  -- puede vigilar un CHECK — eso es la pendiente #17, y lo cubre la aplicación.)
  CONSTRAINT "planes_presentado_coherente" CHECK (
    "estado" NOT IN ('PRESENTADO', 'ACEPTADO', 'RECHAZADO') OR "presentado_en" IS NOT NULL
  ),
  CONSTRAINT "planes_aceptado_coherente" CHECK ("estado" <> 'ACEPTADO' OR "aceptado_en" IS NOT NULL),
  CONSTRAINT "planes_rechazado_coherente" CHECK ("estado" <> 'RECHAZADO' OR "rechazado_en" IS NOT NULL),
  CONSTRAINT "planes_anulacion_coherente" CHECK (
    ("estado" <> 'ANULADO' AND "anulado_en" IS NULL AND "anulado_por_id" IS NULL AND "motivo_anulacion" IS NULL)
    OR ("estado" = 'ANULADO' AND "anulado_en" IS NOT NULL AND "anulado_por_id" IS NOT NULL
        AND "motivo_anulacion" IS NOT NULL AND char_length(btrim("motivo_anulacion")) BETWEEN 1 AND 1000)
  ),
  CONSTRAINT "planes_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "planes_clinica_id_paciente_id_fkey"
    FOREIGN KEY ("clinica_id", "paciente_id") REFERENCES "pacientes"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "planes_clinica_id_creado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "creado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "planes_clinica_id_anulado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "anulado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "planes_clinica_id_id_key" ON "planes"("clinica_id", "id");
CREATE INDEX "planes_clinica_id_paciente_id_idx" ON "planes"("clinica_id", "paciente_id");

CREATE TABLE "plan_items" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "tratamiento_id" TEXT NOT NULL,
  "diagnostico_id" TEXT,
  "tratamiento_codigo" TEXT NOT NULL,
  "tratamiento_nombre" TEXT NOT NULL,
  "precio_unitario_centavos" INTEGER NOT NULL,
  "descuento_centavos" INTEGER NOT NULL DEFAULT 0,
  "estado" "EstadoPlanItem" NOT NULL DEFAULT 'PROPUESTO',
  "creado_por_id" TEXT NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "plan_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_items_precio_no_negativo" CHECK ("precio_unitario_centavos" >= 0),
  CONSTRAINT "plan_items_descuento_valido"
    CHECK ("descuento_centavos" BETWEEN 0 AND "precio_unitario_centavos"),
  CONSTRAINT "plan_items_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "plan_items_clinica_id_plan_id_fkey"
    FOREIGN KEY ("clinica_id", "plan_id") REFERENCES "planes"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "plan_items_clinica_id_tratamiento_id_fkey"
    FOREIGN KEY ("clinica_id", "tratamiento_id") REFERENCES "tratamientos"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "plan_items_clinica_id_diagnostico_id_fkey"
    FOREIGN KEY ("clinica_id", "diagnostico_id") REFERENCES "diagnosticos"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "plan_items_clinica_id_creado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "creado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "plan_items_clinica_id_id_key" ON "plan_items"("clinica_id", "id");
CREATE INDEX "plan_items_clinica_id_plan_id_idx" ON "plan_items"("clinica_id", "plan_id");

CREATE TABLE "plan_item_dientes" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "plan_item_id" TEXT NOT NULL,
  "fdi" INTEGER NOT NULL,
  "superficie" "Superficie" NOT NULL,

  CONSTRAINT "plan_item_dientes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_item_dientes_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- Cascade permitido SOLO en puentes de dientes de entidades editables (§3.4).
  CONSTRAINT "plan_item_dientes_clinica_id_plan_item_id_fkey"
    FOREIGN KEY ("clinica_id", "plan_item_id") REFERENCES "plan_items"("clinica_id", "id")
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "plan_item_dientes_fdi_superficie_fkey"
    FOREIGN KEY ("fdi", "superficie") REFERENCES "superficies_diente"("fdi", "superficie")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "plan_item_dientes_clinica_id_id_key" ON "plan_item_dientes"("clinica_id", "id");
CREATE UNIQUE INDEX "plan_item_dientes_clinica_id_plan_item_id_fdi_superficie_key"
  ON "plan_item_dientes"("clinica_id", "plan_item_id", "fdi", "superficie");
CREATE INDEX "plan_item_dientes_clinica_id_plan_item_id_idx"
  ON "plan_item_dientes"("clinica_id", "plan_item_id");

ALTER TABLE "planes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "planes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "plan_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "plan_item_dientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_item_dientes" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_planes" ON "planes" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_planes" ON "planes" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_plan_items" ON "plan_items" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_plan_items" ON "plan_items" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_plan_item_dientes" ON "plan_item_dientes" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_plan_item_dientes" ON "plan_item_dientes" TO clident_migrator
  USING (true) WITH CHECK (true);

-- planes es NORMAL. plan_items es PARCIALMENTE_INMUTABLE (§4.2.2): primero se
-- garantiza que no exista UPDATE de tabla (no-op en tabla nueva, pero el orden
-- documentado se respeta) y después se concede SOLO sobre las columnas mutables.
-- El precio que el paciente vio queda fuera del alcance de la aplicación.
GRANT SELECT, INSERT, UPDATE ON "planes" TO clident_app;
GRANT SELECT, INSERT ON "plan_items" TO clident_app;
REVOKE UPDATE ON "plan_items" FROM clident_app;
GRANT UPDATE ("estado", "actualizado_en") ON "plan_items" TO clident_app;
GRANT SELECT, INSERT, DELETE ON "plan_item_dientes" TO clident_app;
GRANT SELECT ON "planes", "plan_items", "plan_item_dientes" TO clident_readonly;
