# ADR-010 — npm + Neon + PostgreSQL real en pruebas

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 1

## Contexto

Toda la seguridad y la integridad de CLIDENT vive en PostgreSQL, no en la aplicación: RLS (ADR-001), FK compuestas (ADR-004), el `EXCLUDE` de la agenda (ADR-008), la columna generada del DUI, los `CHECK` de sobreaplicación, y los privilegios por tabla que hacen append-only al historial clínico (ADR-005).

Eso condiciona cómo se prueba el sistema. Y la verificación del entorno real de Carlos, en el Ciclo 0, arrojó dos hechos:

- **`pnpm` no está instalado. Docker tampoco.** El plan original asumía ambos.
- **Node v26.5.0 y npm v11.17.0 sí están.**

El propietario no es programador: cada herramienta que haya que instalar y mantener es un punto de fricción y de fallo permanente.

## Decisión

**npm** como package manager. **Neon** con ramas separadas por entorno. **PostgreSQL real** en todas las pruebas de integración, incluido CI. **Sin Docker.**

### Entornos

| Entorno | Base de datos | Uso |
|---|---|---|
| **Desarrollo** | Rama Neon `desarrollo` | Máquina local |
| **Pruebas** | Rama Neon `pruebas` | Integración local y GitHub Actions |
| **Producción** | Rama Neon `produccion` | **NUNCA se usa para pruebas** |

### Conexiones separadas, siempre

- `DATABASE_URL` → rol `clident_app` → runtime. Única que la aplicación conoce. Con pooler (`?pgbouncer=true`).
- `MIGRATION_DATABASE_URL` → rol `clident_migrator` → **solo secreto de GitHub Actions**, nunca en Vercel. Conexión **directa** (los poolers en modo transacción no soportan bien el DDL).

El arranque valida con Zod y **aborta el proceso** si detecta `MIGRATION_DATABASE_URL` en runtime.

### Pruebas

- **Vitest + PostgreSQL real. Nunca un simulacro de la base de datos.**
- Migraciones con `clident_migrator`; las pruebas consultan con `clident_app`.
- `tests/setup.ts` corre **`prisma migrate deploy`**, nunca `db push`.
- CI: GitHub Actions con PostgreSQL real. `npm run lint && npm run typecheck && npm test` obligatorio para merge.

### Prisma 7

La URL **no** va en `schema.prisma` (Prisma 7 lo rechaza). Va en `prisma.config.ts`. Verificado empíricamente en el Ciclo 0 contra Prisma 7.8.0.

## Alternativas descartadas

**Mockear Prisma en las pruebas.** Descartada, y es la más peligrosa. **Todo lo que importa en este diseño vive en PostgreSQL.** Un Prisma mockeado no probaría RLS, ni el `EXCLUDE`, ni las FK compuestas, ni los `CHECK`, ni los privilegios — o sea, no probaría **nada de lo que hace correcto al sistema**, mientras reporta verde. Es el peor resultado posible: confianza falsa sobre la parte más crítica.

**SQLite en pruebas.** Descartada por lo mismo, más fuerte: SQLite no tiene RLS, ni `EXCLUDE`, ni rangos, ni columnas generadas con esta semántica, ni roles. Probaría un sistema que no es CLIDENT.

**Docker + `docker-compose` con Postgres local.** Era el plan original. Descartada: Carlos no tiene Docker y tendría que instalarlo y mantenerlo. Neon ya está en el stack y sus ramas dan bases desechables sin nada que instalar. **Menos herramientas es un requisito del proyecto, no una preferencia.**

**pnpm.** Es mejor que npm en velocidad y uso de disco. Descartada igual: no está instalado, y `npm` ya funciona. Un package manager extra es una herramienta más que mantener y una fuente de instrucciones contradictorias para los agentes, a cambio de segundos de instalación. No vale el costo.

**Una sola base para todo.** Descartada sin discusión: las pruebas truncan tablas. Correrlas contra producción borraría expedientes clínicos.

**Producción para pruebas ocasionales** ("solo un test rápido"). Prohibido. La regla no admite excepciones porque las excepciones son justo donde ocurren los accidentes.

## Consecuencias

**A favor:**
- Las pruebas ejercitan los mismos constraints que producción. Si RLS está mal, la prueba falla.
- Nada que instalar más allá de Node.
- Las ramas de Neon se crean y destruyen en segundos, con respaldos automáticos.
- La credencial de migraciones **no existe** en el entorno de runtime: ningún endpoint puede usarla.

**En contra:**
- **Las pruebas de integración requieren red.** Sin internet no corren. Es el costo directo de no tener Docker.
- Más lentas que una base en memoria.
- Depende de un proveedor externo (Neon) para desarrollar.
- Las ramas de Neon tienen límites de plan; con un solo desarrollador no es problema, con un equipo habría que revisarlo.

**Regla no negociable que se deriva de esto:**

> **En desarrollo la aplicación también usa `clident_app`.** Desarrollar como superusuario significa no ver nunca RLS actuando y descubrir en producción que las políticas estaban mal desde el principio. **Si RLS rompe algo, tiene que romper en la máquina del desarrollador.**

**Riesgo asociado:** `tests/setup.ts` debe usar `migrate deploy`, nunca `db push`. Un `db push` se saltaría las migraciones SQL manuales — o sea, se saltaría **exactamente lo que hay que probar** — y la suite pasaría en verde sobre un esquema sin ninguna de sus defensas.

## Costo de revertir

**Bajo.** Cambiar de npm a pnpm es regenerar el lockfile. Agregar Docker más adelante es agregar un `docker-compose.yml` y cambiar una URL de conexión: las pruebas ya hablan con PostgreSQL real, así que no cambia nada más.

Esta es la decisión más barata de revertir de las diez, y por eso se tomó rápido.
