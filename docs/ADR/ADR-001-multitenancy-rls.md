# ADR-001 — Multi-tenancy por `clinicaId` + Row Level Security

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 0

## Contexto

CLIDENT se vende a varias clínicas odontológicas que **compiten entre sí**, sobre una sola base de datos compartida. Los datos son expedientes clínicos: información de salud de personas identificables.

Una filtración entre clínicas no sería un bug: sería exponer expedientes de salud a un competidor, y de eso responde el operador del sistema.

La restricción que domina: **el sistema lo mantienen agentes de IA**, no un equipo que recuerda las convenciones. El modo de fallo realista no es un ataque: es una función nueva que olvida `where clinicaId`, escrita dentro de seis meses, que pasa la revisión porque *se ve bien*.

## Decisión

**Base compartida, `clinicaId` obligatorio y `NOT NULL` en toda tabla de inquilino, con dos capas de aislamiento independientes:**

**Capa 1 — Repositorios con alcance explícito (primaria).** Toda función de acceso a datos recibe `ctx: TenantContext` como primer parámetro y escribe el filtro a mano:

```ts
const p = await db.paciente.findFirst({ where: { id, clinicaId: ctx.clinicaId } });
if (!p) throw new AppError('NOT_FOUND');   // cross-tenant se ve igual que inexistente
```

La clínica activa sale **únicamente de la sesión**, nunca de URL, parámetro o body. Los esquemas Zod de entrada no contienen `clinicaId`.

**Capa 2 — Row Level Security de PostgreSQL (red de seguridad).**

```sql
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pacientes FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pacientes
  USING      (clinica_id = NULLIF(current_setting('app.clinica_id', true), ''))
  WITH CHECK (clinica_id = NULLIF(current_setting('app.clinica_id', true), ''));
```

Sostenido por privilegios: `clident_app` **no es superusuario, no es dueño de ninguna tabla y no tiene `BYPASSRLS`**. `FORCE` hace que las políticas se apliquen incluso al dueño.

## Alternativas descartadas

**Una base de datos por clínica.** Aislamiento perfecto, pero cada migración habría que correrla N veces, y una que falle a mitad deja el parque en estados distintos. Para un mantenedor no programador es inmanejable.

**Extensión de Prisma que inyecte `clinicaId` automáticamente.** Descartada, y es la alternativa que más tentaba. `db.paciente.findMany({})` *parece* un escaneo completo de tabla: un agente de IA **no puede saber leyendo esa línea si es seguro**. Además falla en silencio con escrituras anidadas, `upsert` y SQL crudo. **Una magia correcta el 95% del tiempo es peor que ninguna magia**, porque entrena a los agentes a dejar de pensar en el aislamiento. El filtro explícito es verboso pero visible en el diff, greppable y testeable.

**Solo la capa de repositorios, sin RLS.** Es lo que recomendó el diseño inicial: RLS es invisible desde el código de aplicación y un agente no puede verificar su corrección leyendo el archivo que edita. **Rechazado por el propietario, con razón:** con filtros explícitos, olvidar uno es posible, y el fallo es silencioso e ilimitado. Para datos de salud entre competidores, eso no es aceptable.

**Solo RLS, sin capa de repositorios.** El código quedaría ilegible respecto de la seguridad, y las consultas devolverían resultados vacíos misteriosos en desarrollo.

**`ENABLE ROW LEVEL SECURITY` sin `FORCE`.** Ésta fue una **falla real del diseño inicial**, corregida por el propietario. `ENABLE` no aplica las políticas al dueño de la tabla ni a superusuarios. Si la aplicación llegara a conectarse con el rol dueño —variable de entorno mal copiada, script de mantenimiento, agente "simplificando"— todas las clínicas quedan expuestas **en silencio y sin síntoma**. Sin `FORCE`, RLS es teatro.

## Consecuencias

**A favor:**
- Un `clinicaId` olvidado produce cero filas, no una filtración.
- El aislamiento es legible en el archivo que el agente edita (capa 1) y no evadible desde código (capa 2).
- Un `NOT_FOUND` en vez de `FORBIDDEN` no filtra la existencia de datos ajenos.
- Aplica también a SQL crudo mal escrito: no puede cruzar clínicas.

**En contra:**
- ~40 líneas de SQL crudo por migración; Prisma no expresa RLS.
- Cada request debe correr dentro de una transacción que fije el GUC.
- **`clinicaId` nunca puede ser nulable.** Una columna nulable que "significa global" es por donde se filtran los datos bajo RLS.

**Frágil:**
- **El footgun:** `set_config('app.clinica_id', $1, true)` — el tercer parámetro `true` (`SET LOCAL`) no es opcional. Con `SET` de sesión y pooler en modo transacción (Neon lo usa), la conexión se recicla **conservando la clínica anterior**: filtración intermitente, irreproducible y sin error. Mitigación: `src/server/db/tenant.ts` es el único archivo que lo toca.
- La capa 1 no tiene backstop en código: una función nueva que olvide el filtro solo la atrapan RLS y la prueba estructural.

**Mitigación obligatoria:** una prueba estructural que consulta `pg_class`/`pg_policies` y **falla el build** si alguna tabla con `clinica_id` no tiene RLS habilitado, forzado y con política. Es la prueba más valiosa del proyecto: cuando dentro de un año un agente agregue el módulo de radiografías y olvide la política, el build falla en vez de filtrar imágenes de pacientes.

## Costo de revertir

**Altísimo.** `clinicaId` está en cada tabla, cada consulta, cada política y cada FK compuesta (ADR-004). Quitarlo es rehacer la base de datos. Cambiar a base-por-clínica exigiría migrar cada inquilino a su propia base.

Esto no se revierte. Se decidió una vez, en el Ciclo 0.
