-- Precio habitual por clínica y registro de tarifa preferencial (ADR-020)
--
-- El ADR-018 había sacado los precios del catálogo porque un valor por defecto
-- es lo que la gente acepta sin pensar. Vuelve un precio, con otra forma y otro
-- propósito: es de cada clínica —nunca de plataforma—, y existe para que la
-- clínica pueda responder cuánto cobró, cuánto era lo normal y cuánto dio en
-- tarifa preferencial. Sin una referencia guardada, `descuento_centavos` era un
-- número suelto sin contra-qué.
--
-- No se llama `precio_lista_centavos`: ese es el nombre de la columna que el
-- ADR-018 borró, y reusarlo confundiría dos cosas distintas.

-- ── El precio habitual de la clínica ─────────────────────────────────────────
-- Nullable a propósito: un tratamiento puede no tener precio habitual todavía y
-- eso no puede bloquear nada. Queda cubierto por el GRANT de tabla que ya tiene
-- `tratamientos` (SELECT, INSERT, UPDATE): un grant de tabla alcanza a las
-- columnas futuras, así que la clínica puede editarlo como cualquier otro campo
-- del catálogo.
ALTER TABLE "tratamientos" ADD COLUMN "precio_habitual_centavos" INTEGER;

ALTER TABLE "tratamientos"
  ADD CONSTRAINT "tratamientos_precio_habitual_no_negativo"
  CHECK ("precio_habitual_centavos" IS NULL OR "precio_habitual_centavos" >= 0);

-- ── El snapshot en el plan ───────────────────────────────────────────────────
-- Esta es la pieza que hace que todo lo demás sirva. Guarda lo que era habitual
-- CUANDO SE ARMÓ ESE PLAN. Si la clínica sube su tarifa en marzo, lo que se
-- registró como preferencial en enero no puede cambiar — mismo razonamiento que
-- los snapshots de nombre y precio del ADR-006, y la misma prohibición: ningún
-- cálculo de preferencial hace join a `tratamientos`.
ALTER TABLE "plan_items" ADD COLUMN "precio_habitual_centavos" INTEGER;

ALTER TABLE "plan_items"
  ADD CONSTRAINT "plan_items_precio_habitual_no_negativo"
  CHECK ("precio_habitual_centavos" IS NULL OR "precio_habitual_centavos" >= 0);

-- ── Privilegios (ADR-012) ────────────────────────────────────────────────────
--
-- **A `plan_items` NO se le agrega esta columna al GRANT de UPDATE, y es
-- deliberado.** La tabla tiene `REVOKE UPDATE` y solo `GRANT UPDATE (estado,
-- actualizado_en)`, así que la columna nueva nace inmutable: un `UPDATE` sobre
-- ella recibe *permission denied* de PostgreSQL. Es exactamente lo que debe
-- pasarle a un snapshot. No hay nada que conceder acá; escribirlo es la única
-- forma de que quien lea esta migración sepa que la omisión es una decisión y
-- no un olvido.
--
-- No hay tablas nuevas: no hay clase de privilegio que declarar.
