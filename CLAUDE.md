# CLAUDE.md — Manual operativo obligatorio de CLIDENT

> **Leé este archivo completo antes de tocar cualquier cosa.** No es una guía de estilo: son las reglas que hacen que este sistema sea correcto. Romper una de ellas no produce un error visible — produce datos clínicos destruidos, deuda inventada o expedientes de una clínica filtrados a otra.

CLIDENT es un sistema de gestión para clínicas odontológicas, multi-clínica (SaaS) desde la arquitectura.

**El propietario no es programador.** Es abogado y mantiene este sistema mediante agentes de IA. Por eso: arquitectura convencional y aburrida, sin herramientas exóticas, sin sobreingeniería, sin dependencias innecesarias. Si dudás entre lo elegante y lo obvio, elegí lo obvio.

---

## 0. El párrafo que resume todo

> Toda tabla tiene `clinicaId`. Toda lectura usa `findFirst({ where: { id, clinicaId: ctx.clinicaId } })` — **nunca** `findUnique({ where: { id } })`. Solo `src/server/db/**` importa Prisma. Los precios son centavos enteros, copiados (congelados) al escribir: **si hacés join a `Tratamiento` para obtener el precio de un plan existente, introdujiste un bug**. Los datos clínicos nunca se borran ni se sobrescriben: los cambios del odontograma son filas nuevas de `EventoOdontograma`, las correcciones de procedimientos son filas de `EnmiendaProcedimiento`, y todo lo demás se anula con motivo. Un tratamiento presupuestado o realizado **no** es deuda: la deuda existe solo cuando existe una fila de `Cargo`, y los `Cargo` los crea únicamente un humano desde el módulo de Caja. `set_config('app.clinica_id', ..., true)` solo se toca en `src/server/db/tenant.ts`, y el tercer parámetro `true` es obligatorio: sin él, el pooler filtra datos entre clínicas. **Nunca corras `prisma db push`**: borra en silencio el constraint de solapamiento de citas, las políticas RLS y la columna `dui_enmascarado`, que viven en migraciones SQL escritas a mano. Ante la duda, agregá un constraint de base de datos, no una validación en código.

---

## 1. Principio rector

> **Se hace cumplir en la base de datos cuando el mecanismo es legible.** Cuando el mecanismo de base de datos sería más confuso que el bug que previene, se hace en la aplicación y se prueba. **Excepción:** los invariantes de seguridad y de dinero se hacen cumplir en la base **aunque cueste legibilidad**, porque su lado malo no tiene techo.

Un agente de IA olvida un `where`. No puede olvidar un constraint.

---

## 2. Reglas multi-tenant

1. **`clinicaId` es obligatorio y `NOT NULL` en toda tabla de inquilino.** Nunca nulable. Una columna nulable que "significa global" es exactamente por donde se filtran los datos bajo RLS.
2. **La clínica activa sale ÚNICAMENTE de la sesión.** Jamás de una URL, un parámetro, un campo del request ni un header.
3. **Los esquemas Zod de entrada NO contienen `clinicaId`.** Si no está en el esquema, un cliente malicioso no puede suplirlo.
4. **Toda función de repositorio recibe `ctx: TenantContext` como primer parámetro.** Sin default, sin opcional.
5. **Siempre `findFirst({ where: { id, clinicaId: ctx.clinicaId } })`. Nunca `findUnique({ where: { id } })`.** Esta es la convención más importante del proyecto.
6. **Cross-tenant devuelve `NOT_FOUND`, no `FORBIDDEN`.** No se filtra la existencia de datos de otra clínica.
7. Hay **dos capas**: los repositorios con filtro explícito (legible, greppable) y RLS de PostgreSQL (red de seguridad no evadible). Las dos, siempre.

### Entidades SIN `clinicaId` (las únicas)

| Entidad | Razón |
|---|---|
| `Clinica` | Es el inquilino; no se contiene a sí misma |
| `Usuario` | Identidad global. El vínculo vive en `Membresia` |
| `DienteRef`, `SuperficieDiente` | Referencia estática universal, inmutable |
| Plantillas del catálogo | Plantillas de plataforma; se **copian** al catálogo de cada clínica |

---

## 3. Reglas de integridad referencial

1. **Toda tabla de inquilino lleva `@@unique([clinicaId, id])`.** Es lo que la habilita como destino de FK compuesta.
2. **Toda relación entre dos tablas de inquilino usa FK compuesta:** `[clinicaId, xId] → [clinicaId, id]`, con `@relation("nombre")` para desambiguar.
3. **`onUpdate: Restrict` explícito en toda FK compuesta.** Prisma pone `CASCADE` por defecto; con FK compuesta eso arrastraría al hijo a otra clínica si cambiara el `clinicaId` del padre.
4. **`onDelete: Restrict` por defecto.** `Cascade` solo en tablas puente de dientes de entidades editables (`DiagnosticoDiente`, `PlanItemDiente`).

**Por qué:** `clinicaId` en ambas tablas **no impide nada** por sí solo — una `Cita` de la Clínica A apuntando a un `Paciente` de la B produce dos filas internamente coherentes, y ni RLS ni la aplicación lo detectan. Con FK compuesta, la clínica del hijo y la del padre **son la misma columna**: no se validan, no pueden diferir.

**Excepciones (FK simple):** `X.clinicaId → Clinica.id` (Clinica es el inquilino), `Membresia.usuarioId → Usuario.id` y `Auditoria.usuarioId → Usuario.id` (Usuario es global **por diseño**: es donde una identidad cruza clínicas), y las FK a tablas globales de referencia.

---

## 4. PROHIBIDO: `prisma db push`

**Nunca, bajo ninguna circunstancia, por ningún motivo.**

`db push` **borra en silencio**:
- el constraint `EXCLUDE` que impide el doble booking de citas,
- las políticas RLS que aíslan las clínicas,
- la columna generada `dui_enmascarado`,
- los `CHECK` que impiden sobreaplicar pagos y dejar stock negativo.

Todo eso vive en **migraciones SQL escritas a mano** que Prisma no conoce. Tras un `db push`, la aplicación **sigue pareciendo que funciona** mientras el doble booking vuelve a ser posible y los DUI se filtran.

No existe script `db:push` en `package.json`. No lo agregues. Si un agente te sugiere `db push` "para ir más rápido", está proponiendo borrar la seguridad del sistema.

**Migraciones: siempre `prisma migrate dev --create-only` + SQL a mano + `prisma migrate deploy`.** Nunca otra cosa.

---

## 5. Uso obligatorio de migraciones

Estas cosas **no** las puede expresar `schema.prisma` y viven en SQL escrito a mano dentro de `prisma/migrations/`:

| Qué | Por qué |
|---|---|
| `ENABLE` + `FORCE ROW LEVEL SECURITY` + políticas | Prisma no expresa RLS |
| `GRANT` / `REVOKE` por tabla y por columna | Prisma no gestiona privilegios |
| `CREATE EXTENSION btree_gist` + `EXCLUDE` de citas | Prisma no expresa `EXCLUDE` |
| Columna generada `dui_enmascarado` | Prisma no expresa columnas generadas |
| Todos los `CHECK` | Prisma no expresa `CHECK` |

**Flujo obligatorio:**
```
npx prisma migrate dev --create-only    # genera el archivo
# ... editar migration.sql a mano, agregar el SQL ...
npx prisma migrate dev                  # aplica
```

**No hay migraciones destructivas.** Nunca borres una columna con datos. Nunca borres una tabla. Si algo debe dejar de usarse, se deja de leer y se documenta.

---

## 6. Separación conceptual: NO mezclar estas entidades

```
PACIENTE → EXPEDIENTE → ODONTOGRAMA → DIAGNÓSTICO → PLAN DE TRATAMIENTO
        → PROCEDIMIENTO REALIZADO → [decisión humana en Caja] → CARGO → PAGO
                                     ↑
                           la deuda nace SOLO aquí
```

| No mezclar | Por qué |
|---|---|
| **Diagnóstico** y **tratamiento** | Un diagnóstico genera 0, 1 o **muchos** tratamientos. Pulpitis en el 26 → endodoncia + reconstrucción + corona. Nunca hagas una relación 1:1. |
| **Catálogo** y **tratamiento asignado** | `Tratamiento` es el catálogo maestro. `PlanItem` es lo asignado a un paciente. Son tablas distintas y **el precio no se lee del catálogo** (§7). |
| **Planificado** y **realizado** | `PlanItem` es intención. `Procedimiento` es un hecho clínico ocurrido. Estados y tablas independientes. |
| **Realizado** y **cobrado** | Un procedimiento realizado **no es deuda**. Ver §8. |

---

## 7. Precios históricos (snapshots)

> `Tratamiento.precioListaCentavos` se lee **exactamente una vez**: al crear un `PlanItem`. Después, el precio del plan es `PlanItem.precioUnitarioCentavos`.

**Cualquier consulta que haga join de `PlanItem` (o `Procedimiento`, o `LineaCargo`) a `Tratamiento` para mostrar o calcular un precio es un bug.**

- Cambiar el precio del catálogo **nunca** altera un plan existente — **ni siquiera uno en `BORRADOR`**.
- También se congelan `tratamientoNombre` y `tratamientoCodigo`: renombrar "Resina" → "Restauración con resina" no debe reescribir la historia.
- Desactivar un tratamiento (`activo = false`) solo lo saca del selector. **Nunca afecta planes existentes.**

**Advertencia para agentes:** vas a ver `tratamientoNombre` duplicado en `PlanItem` y te va a dar ganas de "normalizarlo" con un join. **Eso es exactamente el bug.** Los campos snapshot son deliberados. No los toques.

---

## 8. La deuda nace solo en Caja

| Concepto | Dónde vive | ¿Es deuda? |
|---|---|---|
| Presupuestado | `PlanItem.estado = PENDIENTE` | ❌ No |
| Aceptado | `PlanItem.estado = ACEPTADO` | ❌ **No** |
| Realizado | `Procedimiento.estado = REALIZADO` | ❌ **No** |
| Facturado / cobrado | `Cargo` creado explícitamente | ✅ **Sí — aquí nace** |
| Pagado | `AplicacionPago` cubre el `Cargo` | — |

**No existe ninguna ruta automática de plan o procedimiento a `Cargo`.** Solo `crearCargo(ctx, ...)`, invocada desde el módulo de Caja por un usuario con permiso `caja:write`. **Nada más en el código importa esa función.**

- Aceptar un plan **no** crea deuda.
- Realizar un procedimiento **no** crea deuda.
- Caja muestra "procedimientos realizados sin cargo" como lista de trabajo, y **un humano decide**.

---

## 9. Protección del historial clínico y reglas append-only

**Los datos clínicos y financieros no se borran nunca. No hay `DELETE`.**

Tablas **append-only** — `clident_app` tiene **solo `SELECT` e `INSERT`** sobre ellas (sin `UPDATE`, sin `DELETE`, a nivel de privilegios de PostgreSQL):

- `eventos_odontograma`
- `auditoria`
- `movimientos_inventario`
- `aplicaciones_pago`

No es una convención que puedas olvidar: **la base de datos rechaza el borrado.**

| Corrección de… | Se hace con… |
|---|---|
| Odontograma | Un evento nuevo `CONDICION_ANULADA` con `anulaEventoId`. **El original sigue existiendo.** |
| Nota clínica de procedimiento | Editable por su autor durante **12 h**. Después: `EnmiendaProcedimiento`, que **preserva el texto anterior**. |
| Procedimiento erróneo | `anularProcedimiento(ctx, id, motivo)` → estado `ANULADO` + auditoría + evento compensatorio. **Nunca delete.** |
| Diagnóstico, cargo, pago | Anulación con motivo obligatorio. Nunca delete. |

**Inmutable tras crearse:** `Procedimiento.realizadoEn`, `precioAplicadoCentavos`, `tratamientoId`, dientes y superficies. Dato equivocado → anular y volver a crear.

Un procedimiento **ya cobrado** no se puede anular sin anular antes el cargo.

---

## 10. Reglas sobre SQL crudo

| Función | Regla |
|---|---|
| `$queryRawUnsafe`, `$executeRawUnsafe` | **PROHIBIDAS sin excepción.** Regla de ESLint que rompe el build. Interpolan strings: son inyección SQL esperando ocurrir. |
| `$queryRaw`, `$executeRaw` (parametrizadas) | Permitidas **solo** dentro de `src/server/db/raw/`. Fuera de ahí, ESLint falla el build. |

- Un archivo por consulta, con comentario obligatorio explicando **por qué** debe ser cruda.
- `git log src/server/db/raw/` es la historia completa de todo el SQL crudo del proyecto.
- Como `clident_app` está sujeto a RLS, **incluso una consulta cruda mal escrita no puede cruzar clínicas.** El SQL crudo se restringe por inyección y legibilidad; el aislamiento no depende de que te acuerdes de filtrar.

---

## 11. Aislamiento de Prisma

1. **`src/server/db/client.ts` es el único archivo que construye `PrismaClient`.**
2. **Importar `@prisma/client` fuera de `src/server/db/**` es error de ESLint** (build roto).
3. Un componente de página que quiera datos llama a un repositorio, nunca a Prisma.
4. `src/server/dto/` es el único lugar que da forma a los datos para el cliente. **El enmascarado del DUI vive ahí y en la base, nunca en el cliente.**

### El footgun que hunde el sistema

```sql
SELECT set_config('app.clinica_id', $1, true);  -- ⚠ el tercer parámetro true NO ES OPCIONAL
```

Con `SET` de sesión en vez de `SET LOCAL`, y con pooler en modo transacción (Neon lo usa), **la conexión se recicla entre requests conservando la clínica anterior**: la Clínica B recibe pacientes de la Clínica A, de forma intermitente, irreproducible y sin ningún error.

**`src/server/db/tenant.ts` es el único archivo del proyecto que toca `set_config`.** No lo "simplifiques". No lo muevas. No lo repliques.

---

## 12. Dinero: centavos enteros

- **Todo monto es `Int` en centavos.** Nunca `Float`. Nunca `Decimal`.
- Los campos se llaman `...Centavos` (`precioUnitarioCentavos`, `montoCentavos`). Si no termina en `Centavos`, no es dinero.
- **`src/lib/money.ts` es el único archivo que divide entre 100**, y solo para mostrar.
- **Por qué no `Decimal`:** Prisma lo devuelve como instancia de `Decimal.js`, que **no es serializable** a través de la frontera servidor→cliente de Next.js. El fallo es un crash o `[object Object]` en un campo de precio.
- Redondeo de porcentajes (descuentos, IVA futuro): solo `aplicarPorcentaje()` de `money.ts`, con prueba unitaria.
- Cualquier **agregado** (sumas de reportes) se calcula como `bigint` en SQL: `Int` topa en $21,474,836.47.

---

## 13. Concurrencia

> **Todo invariante que abarca varias filas se convierte en un invariante de una sola fila**, mediante un contador materializado + `CHECK`, mantenido por un `UPDATE ... SET x = x + $delta` atómico. **Nunca `SELECT` y después `INSERT`. Nunca read-modify-write en código de aplicación.**

- **Nivel de aislamiento: `READ COMMITTED`.** Nunca `SERIALIZABLE` (exigiría bucles de reintento en cada escritura — justo lo que los agentes hacen mal).
- **Orden determinista de bloqueo, siempre:** primero el `Pago`, después los `Cargo` ordenados por id ascendente. Materiales por id ascendente. Dientes por `(fdi, superficie)`. Sin esto: deadlocks.
- `saldoDespues` de inventario **sale del `RETURNING`**, nunca se calcula en código.
- La proyección del odontograma se actualiza **condicionalmente** (`AND ultimo_evento_en <= $nuevo`): un evento retroactivo no puede pisar uno más nuevo.

---

## 14. Reglas de Git

1. **Nunca hagas commit sin que Carlos lo pida explícitamente.**
2. **Nunca hagas push sin autorización explícita.** Nunca en silencio.
3. **Nunca `push --force`.** Nunca `reset --hard` sobre trabajo no publicado. Nunca reescribas historia publicada.
4. **Nunca trabajes directo sobre `main`.** Rama por ciclo: `ciclo-N-descripcion`.
5. **Nunca uses `--no-verify`** ni saltes hooks. Si un hook falla, arreglá la causa.
6. Un ciclo = un objetivo = un commit coherente. Mensajes en español, explicando **por qué**, no qué.
7. **Mostrá el diff antes de pedir aprobación.** Siempre.

---

## 15. Nunca modificar fases futuras sin autorización

El plan tiene fases numeradas (`docs/FLUJO-DE-DESARROLLO.md`). **Trabajás solo en la fase autorizada.**

- **No implementes "de paso"** algo de una fase posterior porque "ya que estamos".
- **No agregues columnas, tablas ni módulos** que pertenecen a fases futuras.
- **No implementes DTE.** Existe el seam (`src/server/billing/dte/types.ts`) y nada más. **No inventes lógica tributaria.**
- **No integres consumo clínico con inventario** todavía.
- **No agregues dependencias sin un ADR** y sin autorización. El stack cerrado son 8 piezas.
- Si detectás que algo de una fase futura es necesario **ahora**, **pará y reportalo**. No lo implementes.

**No tomes decisiones clínicas automáticamente.** El software no diagnostica, no indica tratamientos y no decide qué se cobra.

---

## 16. LOOP DE DESARROLLO OBLIGATORIO

Todo trabajo en CLIDENT sigue este ciclo, sin excepción:

```
1. LEER
   → CLAUDE.md, docs/ARQUITECTURA.md, docs/REGLAS-DE-NEGOCIO.md,
     los ADR relevantes y el código que vas a tocar.

2. DEFINIR UN ÚNICO OBJETIVO
   → Una sola cosa. Si son dos, son dos ciclos.

3. IDENTIFICAR IMPACTO
   → Qué archivos, qué migraciones, qué riesgos, qué se puede romper.

4. IMPLEMENTAR SOLO ESE OBJETIVO
   → Nada "de paso". Nada de fases futuras.

5. EJECUTAR VALIDACIONES
   → npm run lint && npm run typecheck && npm test

6. AUTOAUDITAR
   → Releer el diff contra este archivo, regla por regla.
     ¿findUnique sin clinicaId? ¿join a Tratamiento por precio?
     ¿delete de datos clínicos? ¿db push? ¿SQL crudo fuera de raw/?
     ¿set_config fuera de tenant.ts? ¿dinero que no es Int?

7. MOSTRAR DIFF
   → git diff completo, visible.

8. REPORTAR
   → Qué se hizo, qué se probó, qué quedó pendiente, qué decisiones
     necesitan aprobación, y el siguiente ciclo propuesto.

9. DETENERSE
   → Y esperar aprobación explícita.
```

**Cada ciclo termina y espera aprobación antes de continuar. Sin excepciones.**

Nunca encadenes ciclos. Nunca "aprovechés el impulso". Nunca asumas que la aprobación de un ciclo autoriza el siguiente.

---

## 17. Entorno

- **Package manager: `npm`.** No `pnpm`, no `yarn`, no `bun`.
- **Sin Docker.** Las pruebas usan una rama dedicada de Neon.
- **Base de datos: Neon PostgreSQL**, con ramas separadas: `desarrollo`, `pruebas`, `producción`.
- **Producción NUNCA se usa para pruebas.**
- **Prisma 7**: la URL **no** va en `schema.prisma`; va en `prisma.config.ts`.
- **Dos conexiones separadas, siempre:**
  - `DATABASE_URL` → rol `clident_app` → runtime. Es la única que la aplicación conoce.
  - `MIGRATION_DATABASE_URL` → rol `clident_migrator` → **solo** secreto de GitHub Actions. **Nunca en Vercel.**
- El arranque valida el entorno con Zod y **aborta el proceso** si detecta `MIGRATION_DATABASE_URL` en runtime.
- **En desarrollo la aplicación también usa `clident_app`.** Desarrollar como superusuario significa no ver nunca RLS actuando y descubrirlo roto en producción.

---

## 18. Idioma

- **Código y datos del dominio: español** (`Paciente`, `Cargo`, `EventoOdontograma`, `precioUnitarioCentavos`).
- **Documentación: español.** `docs/REGLAS-DE-NEGOCIO.md` está escrito para Carlos, que no es programador.
- **Respuestas a Carlos: español salvadoreño, registro informal (vos).**
- Ortografía correcta, siempre.
