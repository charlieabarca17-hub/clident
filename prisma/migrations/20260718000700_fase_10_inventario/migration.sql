-- Fase 10: inventario. El stock negativo es IMPOSIBLE (CHECK >= 0 sobre un
-- contador materializado, §13.1), el historial de movimientos es append-only,
-- y saldo_despues sale del RETURNING del UPDATE atómico — nunca del código.
--
-- NO se descuenta inventario al realizar procedimientos (REGLAS §8, CLAUDE §15):
-- integrar consumo clínico con inventario es una decisión futura.

CREATE TYPE "TipoMovimientoInventario" AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE');

CREATE TABLE "materiales" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "sucursal_id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "unidad" TEXT NOT NULL,
  "stock_actual" INTEGER NOT NULL,
  "stock_minimo" INTEGER NOT NULL,
  "costo_unitario_centavos" INTEGER,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "materiales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "materiales_nombre_valido"
    CHECK (char_length(btrim("nombre")) BETWEEN 1 AND 120),
  CONSTRAINT "materiales_unidad_valida"
    CHECK (char_length(btrim("unidad")) BETWEEN 1 AND 30),
  -- EL constraint de esta fase: el stock nunca queda negativo. No es una
  -- validación que un agente pueda olvidar — es la base rechazando la fila.
  CONSTRAINT "material_stock_no_negativo" CHECK ("stock_actual" >= 0),
  CONSTRAINT "material_stock_minimo_no_negativo" CHECK ("stock_minimo" >= 0),
  CONSTRAINT "material_costo_no_negativo"
    CHECK ("costo_unitario_centavos" IS NULL OR "costo_unitario_centavos" >= 0),
  CONSTRAINT "materiales_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "materiales_clinica_id_sucursal_id_fkey"
    FOREIGN KEY ("clinica_id", "sucursal_id") REFERENCES "sucursales"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "materiales_clinica_id_id_key" ON "materiales"("clinica_id", "id");
CREATE UNIQUE INDEX "materiales_clinica_id_sucursal_id_nombre_key"
  ON "materiales"("clinica_id", "sucursal_id", "nombre");
CREATE INDEX "materiales_clinica_id_sucursal_id_idx" ON "materiales"("clinica_id", "sucursal_id");

CREATE TABLE "movimientos_inventario" (
  "id" TEXT NOT NULL,
  "clinica_id" TEXT NOT NULL,
  "material_id" TEXT NOT NULL,
  "tipo" "TipoMovimientoInventario" NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "saldo_despues" INTEGER NOT NULL,
  "motivo" TEXT,
  "registrado_por_id" TEXT NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id"),
  -- La cantidad lleva signo: ENTRADA suma, SALIDA resta, AJUSTE puede ambas
  -- cosas pero exige motivo (un conteo físico se explica, no se teclea solo).
  CONSTRAINT "movimiento_signo_coherente" CHECK (
    ("tipo" = 'ENTRADA' AND "cantidad" > 0) OR
    ("tipo" = 'SALIDA' AND "cantidad" < 0) OR
    ("tipo" = 'AJUSTE' AND "cantidad" <> 0
       AND "motivo" IS NOT NULL AND char_length(btrim("motivo")) BETWEEN 1 AND 500)
  ),
  CONSTRAINT "movimiento_saldo_no_negativo" CHECK ("saldo_despues" >= 0),
  CONSTRAINT "movimientos_inventario_clinica_id_fkey"
    FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "movimientos_inventario_clinica_id_material_id_fkey"
    FOREIGN KEY ("clinica_id", "material_id") REFERENCES "materiales"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "movimientos_inventario_clinica_id_registrado_por_id_fkey"
    FOREIGN KEY ("clinica_id", "registrado_por_id") REFERENCES "membresias"("clinica_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "movimientos_inventario_clinica_id_id_key"
  ON "movimientos_inventario"("clinica_id", "id");
CREATE INDEX "movimientos_inventario_clinica_id_material_id_idx"
  ON "movimientos_inventario"("clinica_id", "material_id");

ALTER TABLE "materiales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "materiales" FORCE ROW LEVEL SECURITY;
ALTER TABLE "movimientos_inventario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movimientos_inventario" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_materiales" ON "materiales" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_materiales" ON "materiales" TO clident_migrator
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_movimientos_inventario" ON "movimientos_inventario" TO clident_app, clident_readonly
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "migraciones_movimientos_inventario" ON "movimientos_inventario" TO clident_migrator
  USING (true) WITH CHECK (true);

-- materiales es NORMAL (sin DELETE: se desactiva). movimientos_inventario es
-- APPEND_ONLY: el historial de stock no se reescribe ni se borra.
GRANT SELECT, INSERT, UPDATE ON "materiales" TO clident_app;
GRANT SELECT, INSERT ON "movimientos_inventario" TO clident_app;
GRANT SELECT ON "materiales", "movimientos_inventario" TO clident_readonly;
