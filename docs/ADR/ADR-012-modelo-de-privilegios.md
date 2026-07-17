# ADR-012 — Modelo de privilegios: default restrictivo y clases de tabla

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 1
- **Relacionado:** ADR-001 (multitenancy + RLS), ADR-005 (odontograma append-only), ADR-010 (Neon)

## Contexto

La auditoría del Ciclo 1 encontró que **el modelo de privilegios de CLIDENT no existía**. No que estuviera mal: no existía.

`docs/ARQUITECTURA.md` afirmaba en prosa:

> *"Tablas append-only (`eventos_odontograma`, `auditoria`, `movimientos_inventario`, `aplicaciones_pago`): `clident_app` recibe **solo `SELECT` e `INSERT`**."*

Y `CLAUDE.md` §9 lo elevaba a garantía:

> *"No es una convención que puedas olvidar: **la base de datos rechaza el borrado.**"*

**No había un solo `REVOKE` en todo el repositorio.** Una búsqueda exhaustiva (`REVOKE.*eventos_odontograma`, `REVOKE.*auditoria`, `REVOKE.*movimientos_inventario`, `REVOKE.*aplicaciones_pago`, `REVOKE.*dientes_ref`) devolvió **cero resultados en todos los casos**. El único bloque SQL de privilegios del proyecto decía:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO clident_app;

-- Crítico: sin esto, cada tabla nueva rompe producción con "permission denied"
ALTER DEFAULT PRIVILEGES FOR ROLE clident_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clident_app;
```

O sea: **DML completo sobre todo, y toda tabla futura naciendo igual, automáticamente.** El append-only era prosa. `DELETE` estaba concedido sobre `procedimientos`, `cargos`, `pagos`, `pacientes` y `diagnosticos` — la regla *"nunca delete"* del historial clínico era literalmente solo texto.

**Y la corrección que se intentó primero también estaba rota.** El Ciclo 1 arrancó escribiendo:

```sql
REVOKE UPDATE (realizado_en, precio_aplicado_centavos, tratamiento_id)
  ON procedimientos FROM clident_app;
```

Eso **no hace nada**. Documentación oficial de PostgreSQL (`sql-revoke`):

> *"if a role has been granted privileges on a table, then revoking the same privileges from individual columns will have no effect."*

Un privilegio por columna solo restringe cuando es la **única** fuente del privilegio. Con `UPDATE` de tabla concedido, el `REVOKE` por columna es decorativo: la migración pasa, la documentación afirma que el precio es inmutable, y el precio se puede escribir igual.

## Decisión

**Default restrictivo + seis clases de tabla + prueba estructural.**

### 1. El default se invierte: una tabla nueva nace solo legible

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE clident_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO clident_app;
```

Escribirle exige un `GRANT` explícito en su propia migración — que ya lleva SQL a mano obligatorio por el bloque de RLS, así que el costo marginal son dos líneas donde ya había diez.

### 2. Seis clases, y toda tabla pertenece a exactamente una

APPEND_ONLY, REFERENCIA_GLOBAL, PUENTE_EDITABLE, PROYECCION_DERIVADA, PARCIALMENTE_INMUTABLE y NORMAL (sin `DELETE`). El registro canónico vive en `ARQUITECTURA.md` §4.2.1.

### 3. Privilegios por columna, en el orden correcto

```sql
REVOKE UPDATE ON procedimientos FROM clident_app;   -- 1º de tabla
GRANT UPDATE (estado, notas_clinicas, ...) ON procedimientos TO clident_app;  -- 2º por columna
```

El orden no es negociable: revocar a nivel de tabla **también borra los grants por columna**, así que al revés se pierden en silencio.

### 4. Prueba estructural

Espejo de la prueba estructural de RLS. Toda tabla debe estar clasificada; ninguna append-only puede tener `UPDATE`/`DELETE`; `has_column_privilege('clident_app','procedimientos','precio_aplicado_centavos','UPDATE')` debe ser `false`.

**`has_column_privilege()` ve el privilegio por cualquier vía, tabla o columna.** Por eso esta prueba habría atrapado el `REVOKE` decorativo el día que se escribió.

## Alternativas descartadas

**Mantener el default amplio** (`GRANT ... ON ALL TABLES`), como estaba. Su argumento era: *"sin esto, cada tabla nueva rompe producción con permission denied"*. **Ese argumento está exactamente al revés**, y es el corazón de este ADR:

| | Default amplio | Default restrictivo |
|---|---|---|
| Si olvidás el `GRANT` | — | `permission denied` en el primer `INSERT`: **ruidoso, inmediato, barato**. Y con la prueba estructural ni siquiera llega a producción: falla el build |
| Si olvidás el `REVOKE` | Historia clínica borrable y dinero editable, **en silencio, sin techo, sin rastro** — porque justamente el rastro es lo que se borra | — |

El principio rector del proyecto (`CLAUDE.md` §1) ordena esta preferencia sin ambigüedad: *"los invariantes de seguridad y de dinero se hacen cumplir en la base **aunque cueste legibilidad**, porque su lado malo no tiene techo."* Un fallo que se manifiesta al primer intento no tiene comparación con uno que se descubre cuando falta un expediente.

**`REVOKE` por columna sin quitar el de tabla.** Descartada porque **no funciona** — no es una preferencia de diseño, es un hecho de PostgreSQL. Es la forma que este repositorio tuvo escrita y presentada como garantía.

**Triggers en vez de privilegios** para la inmutabilidad. Descartada: el proyecto no usa triggers, son lógica invisible desde el código que el agente edita, y los privilegios cubren el 95% del caso. El 5% restante (des-anular, ver §10.5) queda como riesgo declarado y como decisión pendiente #12.

**Confiar en la revisión de código.** Descartada por la tesis del proyecto: un agente olvida un `where`; no puede olvidar un constraint. Y acá el revisor es alguien que no programa.

**Revocar también a `clident_migrator`.** Imposible y sin sentido: es dueño de las tablas y puede reconcederse cualquier privilegio. Ver "Consecuencias".

## Consecuencias

**A favor:**
- El append-only pasa de prosa a hecho de PostgreSQL. `CLAUDE.md` §9 deja de mentir.
- La inmutabilidad de `precioAplicadoCentavos`, `realizadoEn` y `montoCentavos` es real.
- Una tabla nueva sin clasificar **no compila**. La regresión futura tiene un tope.
- `DELETE` deja de estar disponible sobre historia clínica y dinero.

**En contra:**
- **Cada migración que crea una tabla debe incluir su bloque de `GRANT`.** Dos líneas más, y un `permission denied` la primera vez que alguien lo olvide.
- **Las garantías por privilegios son invisibles desde TypeScript.** Nada indica que `precio_aplicado_centavos` no se puede escribir: el agente escribe el `update`, compila, y falla en runtime. Es el fallo correcto, pero hay que documentarlo o alguien lo "arreglará" devolviendo el privilegio. (Riesgo #11.)
- **El truncado entre pruebas necesita `clident_migrator`.** Si no se documenta, el primer agente que vea la suite fallar por permisos va a devolverle `DELETE` a `clident_app` — y con eso desarma todo. (Riesgo #13.)

**Lo que este ADR NO protege — y hay que decirlo explícito:**

> **`clident_migrator` es dueño de las tablas y puede reconcederse cualquier privilegio.** Ningún `REVOKE` lo ata; lo único que lo alcanza es RLS con `FORCE`. **Este modelo protege contra la aplicación y sus agentes, no contra las migraciones.** Eso ya era la postura del proyecto —`MIGRATION_DATABASE_URL` vive solo en CI y nunca en runtime— pero ningún agente debe creer que el append-only ata al migrator. Ata a `clident_app`, que es quien corre en producción.

## Costo de revertir

**Bajo mientras no haya datos.** Hoy es reescribir un bloque de un documento: no hay código, no hay migraciones, no hay base.

**Impagable después.** Si esto se descubriera con datos reales, la pregunta no sería "¿cómo lo arreglamos?" sino "¿cuántos `UPDATE` y `DELETE` ilegítimos ya ocurrieron sobre historia clínica y dinero?" — y **esa pregunta no tiene respuesta**, porque el rastro es justamente lo que se habría borrado.

Es la corrección con mejor relación barato-ahora / impagable-después de todo el repositorio.
