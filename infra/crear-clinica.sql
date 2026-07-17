-- Parámetros: $1 clínica id, $2 nombre clínica, $3 sucursal id,
-- $4 usuario id, $5 correo, $6 nombre del administrador, $7 membresía id, $8 auditoría id.
-- Se ejecuta exclusivamente con clident_migrator y crea todo en una sola sentencia.
-- No es idempotente para la clínica: repetir $1 falla cerrado con 23505.
WITH nueva_clinica AS (
  INSERT INTO clinicas (id, nombre, estado, creado_en, actualizado_en)
  VALUES ($1, $2, 'PRUEBA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  RETURNING id
),
usuario_insertado AS (
  INSERT INTO usuarios (id, correo, nombre, creado_en, actualizado_en)
  VALUES ($4, lower($5), $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT (correo) DO NOTHING
  RETURNING id
),
usuario_admin AS (
  SELECT id FROM usuario_insertado
  UNION ALL
  SELECT id FROM usuarios WHERE correo = lower($5)
  LIMIT 1
),
sede AS (
  INSERT INTO sucursales (id, clinica_id, nombre, creado_en, actualizado_en)
  SELECT $3, id, 'Sede principal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM nueva_clinica
),
membresia_admin AS (
  INSERT INTO membresias (id, clinica_id, usuario_id, roles, activa, creado_en, actualizado_en)
  SELECT $7, nueva_clinica.id, usuario_admin.id, ARRAY['ADMINISTRADOR']::"Rol"[], true,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM nueva_clinica CROSS JOIN usuario_admin
),
registro AS (
  INSERT INTO auditoria (id, clinica_id, usuario_id, accion, entidad, entidad_id, detalle, creado_en)
  SELECT $8, nueva_clinica.id, usuario_admin.id, 'CLINICA_CREADA', 'Clinica', nueva_clinica.id,
         jsonb_build_object('nombre', $2, 'sucursal', 'Sede principal'), CURRENT_TIMESTAMP
  FROM nueva_clinica CROSS JOIN usuario_admin
)
SELECT nueva_clinica.id AS clinica_id, usuario_admin.id AS usuario_id
FROM nueva_clinica CROSS JOIN usuario_admin;
