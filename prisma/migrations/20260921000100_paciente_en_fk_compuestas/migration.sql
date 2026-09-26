-- El paciente entra a las FK compuestas donde cruzarlo sería un error
--
-- Hallazgos #1 y #4 de la auditoría independiente del 2026-09-21. No eran dos
-- bugs sueltos: eran un patrón. Todas las guardas del sistema preguntaban
-- "¿es de esta clínica?" y ninguna preguntaba "¿es de este paciente?".
--
--   * `aplicarPago()` validaba que el pago y el cargo fueran de la clínica. Un
--     pago del paciente A aplicado a un cargo del paciente B pasaba las guardas,
--     movía los dos contadores de forma coherente y **las cinco consultas de
--     reconciliación quedaban en cero**: A perdía su crédito, B aparecía pagado,
--     y nada chillaba.
--   * `registrarCondicion()` validaba el diagnóstico por clínica. Un evento del
--     odontograma de A podía quedar colgado del diagnóstico de B.
--
-- La corrección no es un `if` en la aplicación: es el mecanismo del §3 del
-- manual, extendido de clínica a paciente. Con `paciente_id` dentro de la FK
-- compuesta, el paciente del hijo y el del padre **son la misma columna**. No se
-- validan: no pueden diferir. Un agente que olvide un `where` no puede romperlo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Guardas. Si ya existe una fila cruzada, esta migración FALLA en vez de
--    cristalizar el error. Nada se borra ni se "corrige" solo: un pago mal
--    aplicado es dinero de un paciente real y lo decide una persona (§9).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE cruzadas bigint;
BEGIN
  SELECT count(*) INTO cruzadas
  FROM "aplicaciones_pago" a
  JOIN "pagos"  p ON p."id" = a."pago_id"  AND p."clinica_id" = a."clinica_id"
  JOIN "cargos" c ON c."id" = a."cargo_id" AND c."clinica_id" = a."clinica_id"
  WHERE p."paciente_id" <> c."paciente_id";

  IF cruzadas > 0 THEN
    RAISE EXCEPTION
      'Hay % aplicacion(es) de pago entre pacientes distintos. La migración se detiene: revisá cuáles son y revertilas desde Caja antes de volver a correrla.', cruzadas;
  END IF;
END $$;

DO $$
DECLARE cruzados bigint;
BEGIN
  SELECT count(*) INTO cruzados
  FROM "eventos_odontograma" e
  JOIN "diagnosticos" d ON d."id" = e."diagnostico_id" AND d."clinica_id" = e."clinica_id"
  JOIN "expedientes"  x ON x."id" = d."expediente_id"  AND x."clinica_id" = d."clinica_id"
  WHERE e."diagnostico_id" IS NOT NULL AND x."paciente_id" <> e."paciente_id";

  IF cruzados > 0 THEN
    RAISE EXCEPTION
      'Hay % evento(s) de odontograma vinculados al diagnóstico de otro paciente. La migración se detiene: hay que anularlos con motivo, no reescribirlos.', cruzados;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DINERO — el paciente entra a la aplicación de pago
-- ─────────────────────────────────────────────────────────────────────────────

-- Destinos: una FK compuesta exige un índice único con exactamente esas columnas.
CREATE UNIQUE INDEX "pagos_clinica_id_paciente_id_id_key"
  ON "pagos" ("clinica_id", "paciente_id", "id");
CREATE UNIQUE INDEX "cargos_clinica_id_paciente_id_id_key"
  ON "cargos" ("clinica_id", "paciente_id", "id");

-- Nullable primero: la tabla puede tener filas y no hay migraciones destructivas.
ALTER TABLE "aplicaciones_pago" ADD COLUMN "paciente_id" TEXT;

-- Relleno desde el cargo. La guarda de arriba ya probó que el pago dice lo mismo.
UPDATE "aplicaciones_pago" a
   SET "paciente_id" = c."paciente_id"
  FROM "cargos" c
 WHERE c."id" = a."cargo_id" AND c."clinica_id" = a."clinica_id";

ALTER TABLE "aplicaciones_pago" ALTER COLUMN "paciente_id" SET NOT NULL;

-- Las FK viejas solo ataban la clínica. Se reemplazan por las que atan las dos
-- cosas. No se pierde ninguna garantía: la nueva es estrictamente más estricta.
ALTER TABLE "aplicaciones_pago"
  DROP CONSTRAINT "aplicaciones_pago_clinica_id_pago_id_fkey";
ALTER TABLE "aplicaciones_pago"
  ADD CONSTRAINT "aplicaciones_pago_clinica_id_paciente_id_pago_id_fkey"
  FOREIGN KEY ("clinica_id", "paciente_id", "pago_id")
  REFERENCES "pagos" ("clinica_id", "paciente_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "aplicaciones_pago"
  DROP CONSTRAINT "aplicaciones_pago_clinica_id_cargo_id_fkey";
ALTER TABLE "aplicaciones_pago"
  ADD CONSTRAINT "aplicaciones_pago_clinica_id_paciente_id_cargo_id_fkey"
  FOREIGN KEY ("clinica_id", "paciente_id", "cargo_id")
  REFERENCES "cargos" ("clinica_id", "paciente_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "aplicaciones_pago_clinica_id_paciente_id_idx"
  ON "aplicaciones_pago" ("clinica_id", "paciente_id");

-- `fk_reversa_exacta` (§12.4) no se toca y no hace falta ampliarla: una reversa
-- copia `pago_id` y `cargo_id` del original, y las dos FK nuevas obligan a que
-- su `paciente_id` coincida con el del pago. No puede quedar en otro paciente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CLÍNICO — el paciente entra al diagnóstico y a su evento de odontograma
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "expedientes_clinica_id_paciente_id_id_key"
  ON "expedientes" ("clinica_id", "paciente_id", "id");

ALTER TABLE "diagnosticos" ADD COLUMN "paciente_id" TEXT;

UPDATE "diagnosticos" d
   SET "paciente_id" = x."paciente_id"
  FROM "expedientes" x
 WHERE x."id" = d."expediente_id" AND x."clinica_id" = d."clinica_id";

ALTER TABLE "diagnosticos" ALTER COLUMN "paciente_id" SET NOT NULL;

-- El paciente del diagnóstico queda atado al de su expediente por construcción:
-- no es una copia que pueda desincronizarse, es la misma columna de la FK.
ALTER TABLE "diagnosticos"
  DROP CONSTRAINT "diagnosticos_clinica_id_expediente_id_fkey";
ALTER TABLE "diagnosticos"
  ADD CONSTRAINT "diagnosticos_clinica_id_paciente_id_expediente_id_fkey"
  FOREIGN KEY ("clinica_id", "paciente_id", "expediente_id")
  REFERENCES "expedientes" ("clinica_id", "paciente_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX "diagnosticos_clinica_id_paciente_id_id_key"
  ON "diagnosticos" ("clinica_id", "paciente_id", "id");

-- El evento ya traía su `paciente_id`. Ahora esa misma columna es la que apunta
-- al diagnóstico. `diagnostico_id` sigue siendo opcional: con MATCH SIMPLE, una
-- FK con una columna NULL no se verifica, que es justo lo que se quiere para un
-- evento sin diagnóstico vinculado.
ALTER TABLE "eventos_odontograma"
  DROP CONSTRAINT "eventos_odontograma_clinica_id_diagnostico_id_fkey";
ALTER TABLE "eventos_odontograma"
  ADD CONSTRAINT "eventos_odontograma_clinica_id_paciente_id_diagnostico_id_fkey"
  FOREIGN KEY ("clinica_id", "paciente_id", "diagnostico_id")
  REFERENCES "diagnosticos" ("clinica_id", "paciente_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "diagnosticos_clinica_id_paciente_id_idx"
  ON "diagnosticos" ("clinica_id", "paciente_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Privilegios (ADR-012)
--
-- No hay tablas nuevas, así que no hay clase nueva que declarar. Las dos
-- columnas agregadas quedan cubiertas por los GRANT **de tabla** que ya existen
-- (`SELECT, INSERT` en aplicaciones_pago; `SELECT, INSERT, UPDATE` en
-- diagnosticos): un GRANT de tabla alcanza a las columnas futuras. No se agrega
-- ni se quita ningún privilegio acá.
-- ─────────────────────────────────────────────────────────────────────────────
