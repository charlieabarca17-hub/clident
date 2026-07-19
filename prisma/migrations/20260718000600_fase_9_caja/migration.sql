-- Fase 9: Caja. La cuenta por cobrar nace AQUÍ y solo aquí (ADR-007), la
-- sobreaplicación tiene dos lados y dos contadores (§13.1), las reversas son
-- filas negativas completas amarradas por FK (§12.4), y nacer no es lo mismo
-- que vencer (ADR-013). Forma del cobro: sin IVA, descuento por línea (ADR-016).

CREATE TYPE "EstadoCargo" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADO', 'ANULADO');
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'OTRO');

-- ── Seam DTE: tabla vacía que fija la relación (§12.7). Sin lógica. ──

CREATE TABLE "documentos_fiscales" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "documentos_fiscales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "documentos_fiscales_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "documentos_fiscales_clinica_id_id_key"
  ON "documentos_fiscales"("clinica_id", "id");

-- ── Cargos ──

CREATE TABLE "cargos" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "paciente_id" TEXT NOT NULL,
  "sucursal_id" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "monto_centavos" INTEGER NOT NULL,
  "monto_aplicado_centavos" INTEGER NOT NULL DEFAULT 0,
  "estado" "EstadoCargo" NOT NULL DEFAULT 'PENDIENTE',
  -- date, no timestamptz: día civil. NOT NULL y SIN DEFAULT (ADR-013): quien
  -- crea el cargo dice cuándo vence, o el INSERT falla con 23502 — ruidoso.
  "fecha_exigible_en" DATE NOT NULL,
  "plan_item_id" TEXT,
  "cuota_numero" INTEGER,
  "documento_fiscal_id" TEXT,
  "anulado_en" TIMESTAMPTZ(3),
  "anulado_por_id" TEXT,
  "motivo_anulacion" TEXT,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "creado_por_id" TEXT NOT NULL,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "cargos_pkey" PRIMARY KEY ("id"),
  -- Un cargo de $0 no existe: con monto 0, PENDIENTE y PAGADO serían ambas
  -- satisfacibles y el estado quedaría ambiguo (§12.5).
  CONSTRAINT "cargo_monto_positivo" CHECK ("monto_centavos" > 0),
  -- Lado 1 de la sobreaplicación: a un cargo no se le aplica más de su valor.
  -- BETWEEN 0 AND (no <=): las reversas negativas no pueden dejarlo bajo cero.
  CONSTRAINT "cargo_no_sobreaplicado"
    CHECK ("monto_aplicado_centavos" BETWEEN 0 AND "monto_centavos"),
  -- Estado y contador amarrados (§13.2). La rama ANULADO exige contador en 0:
  -- "revertí antes de anular" lo hace cumplir la base, no la memoria de nadie.
  CONSTRAINT "cargo_estado_coherente" CHECK (
    ("anulado_en" IS NOT NULL AND "estado" = 'ANULADO' AND "monto_aplicado_centavos" = 0
       AND "anulado_por_id" IS NOT NULL AND "motivo_anulacion" IS NOT NULL) OR
    ("anulado_en" IS NULL AND "monto_aplicado_centavos" = 0 AND "estado" = 'PENDIENTE') OR
    ("anulado_en" IS NULL AND "monto_aplicado_centavos" > 0
       AND "monto_aplicado_centavos" < "monto_centavos" AND "estado" = 'PARCIAL') OR
    ("anulado_en" IS NULL AND "monto_aplicado_centavos" = "monto_centavos" AND "estado" = 'PAGADO')
  ),
  -- ADR-016 (#19): una fecha de cuota tecleada en el siglo equivocado truena acá.
  CONSTRAINT "cargo_fecha_exigible_razonable" CHECK (
    "fecha_exigible_en" BETWEEN DATE '2020-01-01' AND (CURRENT_DATE + INTERVAL '10 years')
  ),
  -- ADR-016 (#16): el número de cuota solo existe colgado de un tratamiento.
  CONSTRAINT "cargo_cuota_coherente" CHECK (
    "cuota_numero" IS NULL OR ("plan_item_id" IS NOT NULL AND "cuota_numero" >= 1)
  ),
  CONSTRAINT "cargos_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "cargos_clinica_id_paciente_id_fkey"
    FOREIGN KEY ("clinica_id", "paciente_id") REFERENCES "pacientes"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "cargos_clinica_id_sucursal_id_fkey"
    FOREIGN KEY ("clinica_id", "sucursal_id") REFERENCES "sucursales"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "cargos_clinica_id_plan_item_id_fkey"
    FOREIGN KEY ("clinica_id", "plan_item_id") REFERENCES "plan_items"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "cargos_clinica_id_documento_fiscal_id_fkey"
    FOREIGN KEY ("clinica_id", "documento_fiscal_id") REFERENCES "documentos_fiscales"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "cargos_clinica_id_creado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "creado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "cargos_clinica_id_anulado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "anulado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "cargos_clinica_id_id_key" ON "cargos"("clinica_id", "id");
CREATE UNIQUE INDEX "cargos_clinica_id_plan_item_id_cuota_numero_key"
  ON "cargos"("clinica_id", "plan_item_id", "cuota_numero");
CREATE INDEX "cargos_clinica_id_paciente_id_idx" ON "cargos"("clinica_id", "paciente_id");
CREATE INDEX "cargos_clinica_id_fecha_exigible_en_idx" ON "cargos"("clinica_id", "fecha_exigible_en");

-- ── Líneas de cargo (dinero descompuesto, append-only) ──

CREATE TABLE "lineas_cargo" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "cargo_id" TEXT NOT NULL,
  "procedimiento_id" TEXT,
  "descripcion" TEXT NOT NULL,
  "precio_original_centavos" INTEGER NOT NULL,
  "descuento_centavos" INTEGER NOT NULL DEFAULT 0,
  "monto_centavos" INTEGER NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "lineas_cargo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "linea_precio_no_negativo" CHECK ("precio_original_centavos" >= 0),
  -- ADR-016 (#3): la aritmética del descuento de mostrador es un CHECK, no una
  -- convención: monto = precio original − descuento, siempre.
  CONSTRAINT "linea_descuento_valido"
    CHECK ("descuento_centavos" BETWEEN 0 AND "precio_original_centavos"),
  CONSTRAINT "linea_aritmetica_coherente"
    CHECK ("monto_centavos" = "precio_original_centavos" - "descuento_centavos"),
  CONSTRAINT "lineas_cargo_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "lineas_cargo_clinica_id_cargo_id_fkey"
    FOREIGN KEY ("clinica_id", "cargo_id") REFERENCES "cargos"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- Referencia informativa, SIN unicidad (ADR-016 #15): el candado del doble
  -- cobro es procedimientos.cargo_id, no esta columna.
  CONSTRAINT "lineas_cargo_clinica_id_procedimiento_id_fkey"
    FOREIGN KEY ("clinica_id", "procedimiento_id") REFERENCES "procedimientos"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "lineas_cargo_clinica_id_id_key" ON "lineas_cargo"("clinica_id", "id");
CREATE INDEX "lineas_cargo_clinica_id_cargo_id_idx" ON "lineas_cargo"("clinica_id", "cargo_id");
CREATE INDEX "lineas_cargo_clinica_id_procedimiento_id_idx"
  ON "lineas_cargo"("clinica_id", "procedimiento_id");

-- ── Pagos ──

CREATE TABLE "pagos" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "paciente_id" TEXT NOT NULL,
  "sucursal_id" TEXT NOT NULL,
  "monto_centavos" INTEGER NOT NULL,
  "monto_aplicado_centavos" INTEGER NOT NULL DEFAULT 0,
  "metodo" "MetodoPago" NOT NULL,
  "referencia" TEXT,
  "anulado_en" TIMESTAMPTZ(3),
  "anulado_por_id" TEXT,
  "motivo_anulacion" TEXT,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "creado_por_id" TEXT NOT NULL,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "pagos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pago_monto_positivo" CHECK ("monto_centavos" > 0),
  -- Lado 2 de la sobreaplicación: de un pago no se reparte más de lo que entró.
  -- Sin esto, $100 se aplican cinco veces a cinco cargos y cada CHECK individual
  -- pasa (§13.1). Este contador también hace real el crédito a favor (§12.4).
  CONSTRAINT "pago_no_sobreaplicado"
    CHECK ("monto_aplicado_centavos" BETWEEN 0 AND "monto_centavos"),
  -- Anular exige contador en 0: primero se revierten las aplicaciones. Sin
  -- esto, un cheque rebotado seguiría "pagando" cargos con plata que no entró.
  CONSTRAINT "pago_anulado_coherente" CHECK (
    "anulado_en" IS NULL OR
    ("monto_aplicado_centavos" = 0 AND "anulado_por_id" IS NOT NULL
       AND "motivo_anulacion" IS NOT NULL)
  ),
  CONSTRAINT "pagos_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "pagos_clinica_id_paciente_id_fkey"
    FOREIGN KEY ("clinica_id", "paciente_id") REFERENCES "pacientes"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "pagos_clinica_id_sucursal_id_fkey"
    FOREIGN KEY ("clinica_id", "sucursal_id") REFERENCES "sucursales"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "pagos_clinica_id_creado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "creado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "pagos_clinica_id_anulado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "anulado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "pagos_clinica_id_id_key" ON "pagos"("clinica_id", "id");
CREATE INDEX "pagos_clinica_id_paciente_id_idx" ON "pagos"("clinica_id", "paciente_id");

-- ── Aplicaciones (append-only, con reversas negativas completas — §12.4) ──

CREATE TABLE "aplicaciones_pago" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "pago_id" TEXT NOT NULL,
  "cargo_id" TEXT NOT NULL,
  "monto_centavos" INTEGER NOT NULL,
  "reversa_de_aplicacion_id" TEXT,
  "motivo_reversa" TEXT,
  -- Columna generada: el destino de la FK de reversa exacta. Prisma no la
  -- expresa — mismo patrón que dui_enmascarado.
  "monto_negado_centavos" INTEGER NOT NULL GENERATED ALWAYS AS (-"monto_centavos") STORED,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "creada_por_id" TEXT NOT NULL,

  CONSTRAINT "aplicaciones_pago_pkey" PRIMARY KEY ("id"),
  -- Aplicación normal: positiva y sin campos de reversa. Reversa: negativa,
  -- con objetivo y motivo. El 0 no cabe en ninguna rama: la auto-reversa
  -- (monto = −monto) es aritméticamente imposible.
  CONSTRAINT "aplicacion_signo_coherente" CHECK (
    ("reversa_de_aplicacion_id" IS NULL     AND "monto_centavos" > 0 AND "motivo_reversa" IS NULL) OR
    ("reversa_de_aplicacion_id" IS NOT NULL AND "monto_centavos" < 0 AND "motivo_reversa" IS NOT NULL)
  ),
  CONSTRAINT "aplicaciones_pago_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "aplicaciones_pago_clinica_id_pago_id_fkey"
    FOREIGN KEY ("clinica_id", "pago_id") REFERENCES "pagos"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "aplicaciones_pago_clinica_id_cargo_id_fkey"
    FOREIGN KEY ("clinica_id", "cargo_id") REFERENCES "cargos"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "aplicaciones_pago_clinica_id_creada_por_id_fkey"
    FOREIGN KEY ("clinica_id", "creada_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "aplicaciones_pago_clinica_id_id_key"
  ON "aplicaciones_pago"("clinica_id", "id");
CREATE INDEX "aplicaciones_pago_clinica_id_pago_id_idx"
  ON "aplicaciones_pago"("clinica_id", "pago_id");
CREATE INDEX "aplicaciones_pago_clinica_id_cargo_id_idx"
  ON "aplicaciones_pago"("clinica_id", "cargo_id");

-- La identidad negada: cinco columnas, un solo hecho posible de referenciar.
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "uq_aplicacion_identidad_negada"
  UNIQUE ("clinica_id", "id", "pago_id", "cargo_id", "monto_negado_centavos");

-- LA constraint (§12.4): una reversa apunta a su original con misma clínica,
-- mismo pago, mismo cargo y monto EXACTAMENTE negado — o no existe.
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "fk_reversa_exacta"
  FOREIGN KEY ("clinica_id", "reversa_de_aplicacion_id", "pago_id", "cargo_id", "monto_centavos")
  REFERENCES "aplicaciones_pago" ("clinica_id", "id", "pago_id", "cargo_id", "monto_negado_centavos")
  ON UPDATE RESTRICT ON DELETE RESTRICT;

-- Una aplicación se revierte una sola vez.
CREATE UNIQUE INDEX "uq_una_reversa_por_aplicacion"
  ON "aplicaciones_pago" ("reversa_de_aplicacion_id")
  WHERE "reversa_de_aplicacion_id" IS NOT NULL;

-- ── ADR-016 (#15): el puntero de cobro en procedimientos ──

ALTER TABLE "procedimientos" ADD COLUMN "cargo_id" TEXT;
ALTER TABLE "procedimientos"
  ADD CONSTRAINT "procedimientos_clinica_id_cargo_id_fkey"
  FOREIGN KEY ("clinica_id", "cargo_id") REFERENCES "cargos"("clinica_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "procedimientos_clinica_id_cargo_id_idx"
  ON "procedimientos"("clinica_id", "cargo_id");
-- La columna entra a la lista de mutables: cobrar la reclama, anular la libera.
GRANT UPDATE ("cargo_id") ON "procedimientos" TO clident_app;

-- ── RLS ──

ALTER TABLE "cargos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cargos" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lineas_cargo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lineas_cargo" FORCE ROW LEVEL SECURITY;
ALTER TABLE "pagos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pagos" FORCE ROW LEVEL SECURITY;
ALTER TABLE "aplicaciones_pago" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aplicaciones_pago" FORCE ROW LEVEL SECURITY;
ALTER TABLE "documentos_fiscales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documentos_fiscales" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_cargos" ON "cargos" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_cargos" ON "cargos" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_lineas_cargo" ON "lineas_cargo" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_lineas_cargo" ON "lineas_cargo" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_pagos" ON "pagos" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_pagos" ON "pagos" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_aplicaciones_pago" ON "aplicaciones_pago" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_aplicaciones_pago" ON "aplicaciones_pago" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_documentos_fiscales" ON "documentos_fiscales" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_documentos_fiscales" ON "documentos_fiscales" TO clident_migrator
  USING (true) WITH CHECK (true);

-- ── Privilegios por clase (§4.2.2: REVOCAR de tabla, conceder por columna) ──

GRANT SELECT, INSERT ON "cargos" TO clident_app;
REVOKE UPDATE ON "cargos" FROM clident_app;
GRANT UPDATE ("estado", "monto_aplicado_centavos", "anulado_en", "anulado_por_id",
              "motivo_anulacion", "documento_fiscal_id", "actualizado_en")
  ON "cargos" TO clident_app;

GRANT SELECT, INSERT ON "pagos" TO clident_app;
REVOKE UPDATE ON "pagos" FROM clident_app;
GRANT UPDATE ("monto_aplicado_centavos", "anulado_en", "anulado_por_id",
              "motivo_anulacion", "actualizado_en")
  ON "pagos" TO clident_app;

-- APPEND_ONLY las tres: dinero descompuesto, dinero aplicado y snapshots
-- tributarios futuros. La base rechaza editarlos o borrarlos.
GRANT SELECT, INSERT ON "lineas_cargo" TO clident_app;
GRANT SELECT, INSERT ON "aplicaciones_pago" TO clident_app;
GRANT SELECT, INSERT ON "documentos_fiscales" TO clident_app;

GRANT SELECT ON "cargos", "lineas_cargo", "pagos", "aplicaciones_pago",
  "documentos_fiscales" TO clident_readonly;
