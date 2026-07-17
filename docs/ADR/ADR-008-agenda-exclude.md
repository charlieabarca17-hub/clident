# ADR-008 — Agenda protegida por `EXCLUDE` constraint

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 0

## Contexto

Requisito del propietario, textual: *"Debe impedirse el doble booking de un mismo odontólogo. No basta con verificar si dos citas comienzan exactamente a la misma hora. Debe detectarse cualquier solapamiento."*

Con la regla conceptual: `nuevoInicio < finExistente AND nuevoFin > inicioExistente`.

Y: *"La validación crítica debe existir en backend o en la capa de persistencia."*

Dos problemas distintos:

1. **Lógica:** solapamiento parcial, cita contenida, cita contenedora, rangos idénticos, y adyacencia exacta (que **no** es conflicto).
2. **Concurrencia:** dos recepcionistas reservando el mismo horario al mismo tiempo. Verificar-y-luego-insertar es una carrera perdida: ambas pasan el `SELECT`, ambas insertan.

## Decisión

**Un `EXCLUDE` constraint parcial de PostgreSQL sobre rangos de tiempo.** Requiere migración SQL escrita a mano.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE citas ADD CONSTRAINT citas_rango_valido CHECK (fin_en > inicio_en);

ALTER TABLE citas
  ADD CONSTRAINT citas_sin_traslape
  EXCLUDE USING gist (
    clinica_id    WITH =,
    odontologo_id WITH =,
    tstzrange(inicio_en, fin_en, '[)') WITH &&
  )
  WHERE (estado <> 'CANCELADA');
```

**Por qué cada pieza:**

- **`tstzrange(..., '[)')`** — medio abierto. El operador `&&` sobre un rango `[)` **es exactamente** `nuevoInicio < finExistente AND nuevoFin > inicioExistente`, o sea, literalmente la regla que pidió el propietario. Solapamiento parcial, cita contenida, contenedora y rangos idénticos los atrapa **el mismo operador**. **No hay lógica booleana escrita a mano que se pueda escribir mal.** Y 09:00–10:00 con 10:00–11:00 **no** se solapan: pegadas, no solapadas.
- **`WHERE (estado <> 'CANCELADA')`** — exclusión **parcial**: las canceladas salen del índice y dejan de bloquear el horario, **atómicamente, en el `UPDATE`**. Sin job de limpieza, sin borrado.
- **`clinica_id WITH =`** — el constraint queda aislado por clínica gratis.
- **`btree_gist`** — requerido para `WITH =` sobre columnas escalares. Extensión estándar; Neon la trae.
- **Todo en `timestamptz`.** `tstzrange` lo exige: una columna `timestamp` haría el constraint **semánticamente incorrecto**.

**Concurrencia resuelta sola:** PostgreSQL serializa la verificación bajo el lock del índice. Exactamente una gana; la otra recibe `SQLSTATE 23P01`.

```ts
try { return await db.cita.create({ data }); }
catch (e) {
  if (esErrorPg(e, '23P01', 'citas_sin_traslape'))
    throw new AppError('AGENDA_TRASLAPE', 'El odontólogo ya tiene una cita en ese horario.');
  throw e;
}
```

**El `SELECT` previo existe SOLO para UX** (agrisar horarios ocupados, avisar antes de enviar). Está documentado explícitamente como **no** siendo la validación.

## Alternativas descartadas

**Validación en la aplicación** (leer citas del odontólogo, comparar rangos en TypeScript). Descartada por dos motivos independientes, y cada uno alcanza: (1) la lógica booleana de solapamiento se escribe mal con facilidad — el propio propietario señaló que "misma hora de inicio" es el error típico; (2) **no resuelve la concurrencia**: dos recepcionistas pasan la validación y ambas insertan.

**Índice único sobre `(odontologo_id, inicio_en)`.** Descartada: atrapa solo el inicio idéntico. 10:00–11:00 y 10:30–11:30 pasarían. Es exactamente el bug que el propietario describió.

**Bloqueo pesimista** (`SELECT ... FOR UPDATE` sobre las citas del odontólogo del día). Funcionaría, pero serializa toda la agenda de ese odontólogo por reserva, y requiere que **cada** ruta de escritura recuerde tomar el lock. Un agente que agregue "reprogramar cita" sin el lock reintroduce el bug silenciosamente. El constraint no se puede olvidar.

**Aislamiento `SERIALIZABLE`.** Resolvería la carrera, pero empuja bucles de reintento a **cada** ruta de escritura del sistema — justo la sutileza que los agentes de IA hacen mal.

**Incluir `sucursal_id` en el `EXCLUDE`.** Descartada, y es un error tentador: **un odontólogo no puede estar en Escalón y Santa Tecla a las 10:00. La sucursal no relaja la física.** El constraint es por odontólogo (ADR-002).

**Borrar las citas canceladas** para que no bloqueen. Descartada: contradice "no borrar datos". La exclusión parcial lo resuelve sin borrar.

## Consecuencias

**A favor:**
- Un solo constraint cubre los cinco casos de solapamiento **y** la carrera concurrente.
- Cancelar libera el horario atómicamente, sin job.
- Imposible de olvidar desde el código: aplica a `create`, a `update` y a cualquier ruta futura.

**En contra:**
- Migración SQL escrita a mano (Prisma no expresa `EXCLUDE`).
- El error llega como `PrismaClientUnknownRequestError`/`P2010` con el código del driver en `meta`. `src/lib/errors.ts` posee el sniffing para que ningún agente tenga que hacerlo.
- Una extensión de PostgreSQL (`btree_gist`) de la que dependemos.

**RIESGO CRÍTICO — el modo de fallo más probable de todo el diseño:**

> **`prisma db push` borra este constraint en silencio.** Prisma no sabe que existe. Después de un `db push`, la aplicación **sigue pareciendo que funciona** mientras el doble booking vuelve a ser posible.

**Mitigaciones obligatorias:**
1. `db push` prohibido en `CLAUDE.md`, en `ARQUITECTURA.md` y en `FLUJO-DE-DESARROLLO.md`.
2. **No existe el script `db:push` en `package.json`.** No se agrega.
3. La prueba de solapamiento falla ruidosamente si el constraint no está.
4. Aserción en CI que consulta `pg_constraint` buscando `citas_sin_traslape`.

**Nota:** `prisma migrate reset` **sí** vuelve a aplicar el SQL manual, porque vive en un archivo de migración. Es `db push` el peligroso.

## Costo de revertir

**Bajo técnicamente, inaceptable en la práctica.** Quitarlo es un `DROP CONSTRAINT`. Pero sin él no hay ninguna otra defensa: la validación en aplicación no resuelve la concurrencia, y ese fue el requisito explícito del propietario.
