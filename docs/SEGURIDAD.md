# Revisión de seguridad — Fase 12

Última revisión: 2026-07-18 (cierre del roadmap inicial).

Este documento no repite la arquitectura de aislamiento (eso vive en
`ARQUITECTURA.md` §4). Registra la **revisión de cierre**: qué se auditó, qué
se encontró y qué quedó declarado como límite conocido.

---

## 1. Dependencias (`npm audit`)

Cinco avisos **moderate**, todos indirectos y **ninguno explotable en runtime**:

| Paquete | Vía | Evaluación |
|---|---|---|
| `postcss` < 8.5.10 | `next` | XSS al *generar* CSS. Corre en `next build`, no en producción. El CSS lo escribimos nosotros; no hay entrada de usuario en el pipeline de estilos. |
| `next` | `postcss` | El mismo aviso, heredado. |
| `@hono/node-server` | `@prisma/dev` | Servidor de desarrollo de Prisma. **No existe en el bundle de producción.** |
| `@prisma/dev`, `prisma` | idem | CLI de migraciones. No corre en runtime. |

**No se aplicó `npm audit fix --force`, y es deliberado:** propone instalar
`next@9.3.3` — una regresión de siete años que rompería el App Router entero.
Cambiar un aviso de build por un downgrade de esa magnitud empeoraría la
seguridad real, no la mejoraría.

**Qué vigilar:** cuando Next publique una versión con `postcss >= 8.5.10`,
actualizar. Es la acción correcta y es barata; forzarla hoy no lo es.

---

## 2. Autenticación

| Control | Estado |
|---|---|
| Hash de contraseñas | **Argon2id** (`argon2` 0.44). |
| Enumeración de usuarios | Mitigada: hash dummy iguala el tiempo de respuesta de un correo inexistente. |
| Fuerza bruta | **Rate limit por correo**: 8 intentos / 15 min (`src/server/auth/rate-limit.ts`). |
| Invitaciones | Token aleatorio, guardado solo como SHA-256, caducidad 24 h, un solo uso. |
| Sesión | JWT de 12 h. **La autorización no confía en el token**: `requireCtx()` revalida la membresía contra PostgreSQL en cada request. |
| Registro público | **No existe.** Las clínicas se crean por script (`infra/`). |

### Límite declarado: el rate limit es en memoria, por instancia

En Vercel cada instancia serverless tiene su propio contador, así que un
atacante distribuido puede multiplicar los intentos por la cantidad de
instancias vivas. **No es un WAF y no pretende serlo.**

Frena el ataque realista contra una clínica (alguien probando contraseñas
contra un correo conocido) sin escribir en la base en cada intento fallido —
que es justo lo que un atacante querría provocar. Si hiciera falta más, el
lugar correcto es el borde (Vercel/Cloudflare), no la aplicación.

**Se cuenta por correo, no por IP:** detrás del NAT de una clínica todos
comparten IP, y bloquear por IP dejaría fuera a la recepción entera.

---

## 3. Autorización

- **18 permisos granulares**, 4 roles, unión si hay varios (`permissions.ts`).
- `ADMINISTRADOR` **no** recibe permisos `clinico:*`: un gerente administrativo
  no lee alertas médicas, diagnósticos ni procedimientos.
- `paciente:read_pii` separado de `paciente:read`: ver el DUI completo es una
  decisión explícita **y auditada**.
- **Los permisos se aplican en el repositorio, no en la pantalla.** El
  historial clínico no *consulta* lo que el rol no puede ver, y el tablero
  devuelve `null` en los campos de dinero para quien no tiene `caja:read`. La
  UI no tiene que acordarse de ocultar nada.

---

## 4. Datos y superficie expuesta

- **Sin API pública.** Todo pasa por Server Actions autenticadas; no hay
  endpoints REST abiertos salvo el handler de Auth.js.
- **El DUI se enmascara en PostgreSQL** (columna generada), no en el cliente.
  Los selectores administrativos **ni siquiera piden** la columna `dui`.
- **Sin subida de archivos.** No hay superficie de carga que validar (las
  radiografías siguen fuera de alcance — pendiente #6, exige su propio ADR).
- **SQL crudo**: 5 archivos en `src/server/db/raw/`, todos parametrizados; las
  variantes `Unsafe` rompen el build por regla de ESLint, en cuatro formas
  sintácticas.
- **Aislamiento**: 4 capas independientes (contexto, filtro de repositorio, RLS
  forzado, FK compuestas). Ningún rol de aplicación tiene `BYPASSRLS`.

---

## 5. Límites conocidos que NO se resolvieron

Están documentados, no olvidados. Ninguno es barato de arreglar y los cuatro
exigen decisión del propietario:

1. **Des-anular es posible a nivel de privilegios** (`procedimientos`, `cargos`,
   `pagos`). Un `CHECK` no ve el valor anterior y el proyecto no usa triggers.
   Mitigación implementada: la consulta de reconciliación #5 lo **detecta**
   contra la auditoría append-only (ADR-016).
2. **Las transiciones de estado las hace cumplir la aplicación**, no la base
   (pendiente #17). Están probadas, pero son *verificadas*, no *imposibles*.
3. **`plan_item_dientes` permite borrar dientes de un plan ya aceptado**: el
   privilegio no distingue un borrador de un plan firmado.
4. **La FK de reversa contra una columna generada no se ha probado contra
   PostgreSQL real** (pendiente #14). Si `migrate deploy` la rechaza, el Plan B
   está escrito en `ARQUITECTURA.md` §12.4.

---

## 6. Lo que este modelo NO protege

`clident_migrator` es dueño de las tablas y **puede reconcederse cualquier
privilegio**. Todo el modelo append-only ata a `clident_app` —quien corre en
producción—, no a las migraciones. Por eso `MIGRATION_DATABASE_URL` vive solo
en los secretos de CI y **nunca en Vercel**, y el arranque aborta el proceso si
la detecta en runtime.
