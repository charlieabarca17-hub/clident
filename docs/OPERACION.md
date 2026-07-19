# Operación de CLIDENT

Guía para poner el sistema a funcionar y mantenerlo. Escrita para que **el
propietario la pueda ejecutar sin ser programador**: cada bloque dice qué hace,
qué esperar y qué significa si algo sale mal.

> **Regla que atraviesa todo el documento:** `MIGRATION_DATABASE_URL` es la
> credencial que puede cambiar la estructura de la base. **Nunca va en Vercel.**
> Vive en tu máquina cuando corrés migraciones, y en los secretos de GitHub
> Actions. La aplicación aborta el arranque si la detecta en runtime.

---

## 1. Preparar la base por primera vez

Se hace **una vez por rama de Neon** (`desarrollo`, `pruebas`, `produccion`).

### 1.1 Crear los tres roles

Con el rol propietario de Neon (`neondb_owner`), en el editor SQL de la consola:

```
Ejecutar el contenido de: infra/bootstrap-roles.sql
```

Crea `clident_app`, `clident_migrator` y `clident_readonly`. Los tres nacen sin
poder evadir RLS. **No se crean con la CLI de Neon** — esos roles reciben
`neon_superuser`, que ignora el aislamiento entre clínicas (ADR-015).

### 1.2 Aplicar las migraciones

Desde la carpeta del proyecto, con la credencial de migración:

```powershell
$env:MIGRATION_DATABASE_URL="postgresql://clident_migrator:CLAVE@HOST/neondb?sslmode=require"
npx prisma migrate deploy
```

**Qué esperar:** aplica 8 migraciones en orden. Cada una crea tablas, activa
RLS, define políticas y concede privilegios.

**⚠ Punto de verificación pendiente (#14).** La migración de Caja crea una
clave foránea contra una columna generada (`monto_negado_centavos`). Es el
único elemento del diseño que no se ha probado contra PostgreSQL real. **Si
`migrate deploy` falla ahí**, no improvises: el Plan B está escrito en
`ARQUITECTURA.md` §12.4 y hay que decidirlo, no parchearlo.

**Nunca uses `prisma db push`.** Borraría en silencio los constraints de
solapamiento, las políticas RLS y las columnas generadas — todo lo que hace
seguro al sistema. No existe ese script en `package.json` y no debe agregarse.

### 1.3 Sembrar los datos globales

```powershell
npm run seed:dientes    # 52 dientes y 312 superficies
npm run seed:catalogo   # 12 categorías y 94 tratamientos de plantilla
```

Ambas son idempotentes: correrlas dos veces no duplica nada.

### 1.4 Crear la primera clínica y su administrador

```powershell
# 1. Crear la clínica (edita los valores dentro del script antes de correrlo)
#    Ejecutar infra/crear-clinica.sql con MIGRATION_DATABASE_URL

# 2. Generar la invitación del primer administrador
npm run invitar-admin -- correo@ejemplo.com
```

El comando devuelve **una ruta de un solo uso, válida por 24 horas**. El token
visible no se guarda en ningún lado: la base solo conserva su hash. Si se
pierde, se genera otro.

Al entrar por esa ruta, la persona define su contraseña y ya puede iniciar
sesión. **La clínica nace sin catálogo:** el primer administrador entra a
Catálogo y aprieta "Copiar catálogo inicial".

### 1.5 Recuperar la contraseña de un usuario existente

Si un usuario perdió su contraseña, desde la carpeta del proyecto ejecutá:

```powershell
npm run restablecer-contrasena -- correo@ejemplo.com
```

El comando toma `MIGRATION_DATABASE_URL` solamente de `.env.migracion`, invalida
de inmediato la contraseña olvidada y devuelve una ruta de un solo uso, válida
por 24 horas. Entregá esa ruta solo a la persona propietaria del correo. El token
visible no se guarda en la base ni se debe ejecutar en CI o en una terminal cuyo
historial se archive.

---

## 2. Configurar el CI

El workflow (`.github/workflows/ci.yml`) corre lint, typecheck y pruebas
unitarias en cada push y pull request. **Las pruebas de integración solo corren
si existen los secretos**, y si faltan el job se salta de forma visible.

En GitHub → Settings → Secrets and variables → Actions:

| Secreto | Valor |
|---|---|
| `TEST_DATABASE_URL` | Conexión de `clident_app` a la rama **pruebas** |
| `TEST_MIGRATION_DATABASE_URL` | Conexión de `clident_migrator` a la rama **pruebas** |
| `TEST_DATABASE_CONFIRM` | `pruebas` |

> **El tercer secreto no es burocracia.** El arnés de integración **borra
> datos** antes de correr. `TEST_DATABASE_CONFIRM=pruebas` es la afirmación
> explícita de que la base apuntada es sacrificable. Sin él, la suite se niega
> a arrancar.

**Nunca pongas `MIGRATION_DATABASE_URL` de producción como secreto de CI.**

---

## 3. Desplegar en Vercel

Variables de entorno del proyecto:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Conexión de `clident_app` **con pooler** (`?sslmode=require&pgbouncer=true`) |
| `AUTH_SECRET` | Cadena aleatoria de 32+ caracteres |

**Sin el pooler, las conexiones se agotan** — es el apagón clásico de una
primera producción serverless.

**No configures `MIGRATION_DATABASE_URL`.** El arranque valida el entorno y
aborta el proceso si la encuentra.

Las migraciones **no** se ejecutan al desplegar: se aplican aparte, con la
credencial de migración, antes de publicar el código que las necesita.

---

## 4. Mantenimiento periódico

### Reconciliación del dinero y el stock

```powershell
$env:MIGRATION_DATABASE_URL="..."
npm run reconciliar
```

**Debe imprimir `Todo cuadra.` siempre.** Si alguna consulta devuelve filas,
hay plata o stock mal contado y el comando sale con error.

Es de lo poco del sistema que podés verificar vos mismo sin leer código: *esta
consulta debe devolver cero filas; si devuelve algo, algo está mal contado.*

Corre con `clident_migrator` a propósito: con la credencial de la aplicación,
RLS devolvería cero filas de todo y "todo cuadra" sería indistinguible de "no vi
nada".

### Reconstruir el odontograma

```powershell
npm run odontograma:rebuild
```

Regenera la proyección del odontograma desde su log de eventos. Es seguro
correrlo cuando quieras: los eventos son la fuente de verdad y no se tocan.

### Respaldos

Neon mantiene *point-in-time recovery* según el plan contratado. **Verificá en
la consola de Neon que la retención de la rama `produccion` sea la que
necesitás** antes de tener pacientes reales — es configuración de Neon, no del
código.

---

## 5. Qué hacer si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `permission denied for table X` | La aplicación intenta una operación que su clase de tabla prohíbe (borrar historia clínica, editar un precio) | **No concedas el privilegio.** El código está intentando algo que el diseño prohíbe a propósito. |
| Cero filas donde debería haber datos | Falta el contexto de clínica (`app.clinica_id`) | RLS está fallando cerrado, como debe. Revisar que la operación pase por `conTenant()`. |
| `not_null_violation` en `fecha_exigible_en` | Se creó un cargo sin decir cuándo vence | Correcto: la columna no tiene default a propósito (ADR-013). |
| `23514` al anular un cargo o pago | Tiene dinero aplicado | Revertir las aplicaciones primero. La base fuerza el orden. |
| El CI marca "skipped" en integración | Faltan los secretos de la rama de pruebas | Ver §2. |
| `MIGRATION_DATABASE_URL` detectada en runtime | Se configuró en Vercel | Quitarla. Nunca va ahí. |

---

## 6. Los comandos, en una tabla

| Comando | Para qué | Credencial |
|---|---|---|
| `npm run dev` | Desarrollo local | `DATABASE_URL` (app) |
| `npm run lint` / `typecheck` / `test` | Validaciones obligatorias | ninguna |
| `npm run test:integration` | Pruebas contra Neon (borra datos) | secretos de pruebas |
| `npx prisma migrate deploy` | Aplicar migraciones | **migración** |
| `npm run seed:dientes` / `seed:catalogo` | Semillas globales | **migración** |
| `npm run invitar-admin -- correo` | Invitar al primer administrador | **migración** |
| `npm run reconciliar` | Verificar dinero y stock | **migración** |
| `npm run odontograma:rebuild` | Regenerar la proyección | **migración** |
