-- Todos los instantes se almacenan con zona horaria. Los valores existentes fueron
-- escritos en UTC; AT TIME ZONE preserva el instante durante la conversión.
ALTER TABLE "clinicas"
  ALTER COLUMN "vigente_hasta" TYPE TIMESTAMPTZ(3) USING "vigente_hasta" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC';
ALTER TABLE "sucursales"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC';
ALTER TABLE "usuarios"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC';
ALTER TABLE "membresias"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC';
ALTER TABLE "auditoria"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

-- Una membresía requiere al menos un rol real: ni arreglo vacío ni NULL interno.
ALTER TABLE "membresias" DROP CONSTRAINT "membresias_con_rol";
ALTER TABLE "membresias"
  ADD CONSTRAINT "membresias_con_rol"
  CHECK (cardinality("roles") >= 1 AND array_position("roles", NULL) IS NULL);

-- Descubrimiento pre-clínica es solo lectura. Toda escritura exige clínica activa
-- en el contexto, incluso si el usuario puede ver su propia membresía.
DROP POLICY "membresia_visible" ON "membresias";
CREATE POLICY "membresia_lectura" ON "membresias"
  FOR SELECT TO clident_app, clident_readonly
  USING (
    "clinica_id" = NULLIF(current_setting('app.clinica_id', true), '')
    OR "usuario_id" = NULLIF(current_setting('app.usuario_id', true), '')
  );
CREATE POLICY "membresia_insercion" ON "membresias"
  FOR INSERT TO clident_app
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
CREATE POLICY "membresia_actualizacion" ON "membresias"
  FOR UPDATE TO clident_app
  USING ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK ("clinica_id" = NULLIF(current_setting('app.clinica_id', true), ''));
