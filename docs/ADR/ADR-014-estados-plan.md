# ADR-014 — Estados de `PlanTratamiento` y `PlanItem`

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 1
- **Relacionado:** ADR-006 (snapshot de precios), ADR-007 (dónde se registra la cuenta por cobrar), ADR-013 (exigibilidad)

## Contexto

**Los estados del plan no existían.** La auditoría del Ciclo 1 encontró que cada documento usaba nombres distintos para lo mismo: `PENDIENTE` en `CLAUDE.md` y en el ADR-007, `BORRADOR` en `ARQUITECTURA.md` §12.2, `PROPUESTO` en la suite `budget-is-not-debt`. **Ningún documento definía los enums**, y `REGLAS-DE-NEGOCIO.md` —que dice de sí mismo *"si una regla no está acá, no existe"*— no los mencionaba.

Peor: `PENDIENTE` ya era un estado de `Cargo`, con significado financiero (deuda sin pagar). Dos entidades usando la misma palabra para cosas distintas, sin que ningún documento lo advirtiera.

Esto no es cosmético. Sin enums definidos, el agente que escriba el esquema en la Fase 7 los inventa — y quedan en la base.

## Decisión

### `PlanTratamiento` — el presupuesto como documento

`BORRADOR` | `PRESENTADO` | `ACEPTADO` | `RECHAZADO` | `ANULADO`

**Aceptar el plan no crea cargos, no mueve dinero y no implica que sus tratamientos se hayan ejecutado** (ADR-007, `REGLAS-DE-NEGOCIO.md` §1.9).

### `PlanItem` — cada tratamiento del plan

`PROPUESTO` | `ACEPTADO` | `EN_PROCESO` | `COMPLETADO` | `CANCELADO` | `ANULADO`

### Las transiciones

Canónicas en `REGLAS-DE-NEGOCIO.md` §4.5. Las tres prohibiciones y su razón:

- **`ACEPTADO → PRESENTADO` (plan): prohibida.** Un plan aceptado es un hecho con fecha: el paciente dijo que sí, ese día, a ese precio. Devolverlo a `PRESENTADO` reescribiría la historia como si la aceptación nunca hubiera ocurrido — y esa aceptación es lo que se le prueba a un paciente que reclama. **Un cambio material sobre un plan aceptado exige un plan nuevo.**
- **`COMPLETADO → CANCELADO` (ítem): prohibida.** `CANCELADO` significa *"existió y se interrumpió"*. Aplicarlo a algo terminado borraría historia clínica con un cambio de estado.
- **`COMPLETADO → ANULADO` (ítem): permitida.** Porque un ítem se puede marcar completado por error **sin ningún `Procedimiento` detrás** (la transición `ACEPTADO → COMPLETADO` directa existe para tratamientos de una sesión). Sin esta salida, el expediente afirmaría para siempre un tratamiento que nunca ocurrió. **`CANCELADO` dice "se interrumpió"; `ANULADO` dice "esto nunca debió existir".** Mismo argumento que `RECHAZADO → ANULADO` en el plan.

### `PROGRAMADO` no es un estado

**El estado de un `PlanItem` describe el progreso clínico; la programación pertenece a Agenda.** Un ítem `ACEPTADO` puede tener cero, una o varias citas; uno `EN_PROCESO` puede tener una cita futura. Si `PROGRAMADO` fuera un estado, una endodoncia empezada con la próxima cita puesta sería `EN_PROCESO` **y** `PROGRAMADO` a la vez. **Un estado no puede contestar dos preguntas.**

El seam `PlanItem ↔ Cita` **queda abierto y no se implementa**: no pertenece a ninguna fase autorizada.

### `COMPLETADO` es una decisión clínica humana

**Nunca por conteo de sesiones.** Una endodoncia puede llevar 2 sesiones o 5 según el conducto. Una regla del tipo *"si se registró la tercera sesión, está completo"* sería el software tomando una decisión clínica, y este sistema no las toma. **No existen** `totalSesiones` obligatorio, `sesionActual` como mecanismo de estado, ni finalización automática.

*(No confundir con la pendiente #10, "cuánto vale cada sesión": eso es dinero y es otra pregunta.)*

### Sin cascadas

**Anular un plan no cambia el estado de sus `PlanItem`.** Ninguno. La endodoncia completada sigue `COMPLETADO` — anular el plan no la desrealiza. Anular impide acciones nuevas; **no reescribe lo que ya pasó**.

**Aceptar el plan sí acepta los ítems marcados** — pero es **una operación de alcance explícito** que el usuario ve y confirma, con un solo registro de auditoría que los nombra. No es cascada silenciosa: es un acto único de una sola persona. *(A diferencia de §1.9, donde las dos acciones son de dos personas por una razón real.)*

**Regla de coherencia:** un `PlanItem` no puede salir de `PROPUESTO` si su plan no está `ACEPTADO`.

## Alternativas descartadas

**Una sola lista de estados para plan e ítems.** Descartada: un plan puede estar `ACEPTADO` mientras un tratamiento está `CANCELADO` y otro `COMPLETADO`. Con una lista habría que mentirle al sistema.

**`PENDIENTE` como estado inicial del `PlanItem`** (lo que decía el borrador del Ciclo 1). Descartada por colisión: `Cargo.estado = PENDIENTE` significa *deuda sin pagar*. La misma palabra para dos cosas distintas es la trampa que este proyecto no se permite.

**`PROGRAMADO` como estado del `PlanItem`.** Descartada: mezcla dos dimensiones (progreso clínico y agenda). Estaba en el brief original del propietario.

**Finalización automática por conteo de sesiones.** Descartada: es una decisión clínica y el software no las toma.

**Cascada de estados al anular el plan.** Descartada: afirmaría que un tratamiento que ocurrió no ocurrió, falsificando el expediente por un efecto secundario.

**Versionado de planes aceptados.** No se diseña ahora — no hace falta para ninguna fase autorizada. Lo que sí se decide hoy es que **la transición que destruiría la aceptación no existe** en el conjunto permitido.

## Consecuencias

**A favor:**
- Los enums existen, en un solo lugar canónico, y el agente de la Fase 7 no los inventa.
- La colisión `PENDIENTE` desaparece.
- Las tres prohibiciones protegen la prueba de la oferta y el expediente.

**En contra — y hay que decirlo claro:**

> **Estas transiciones NO tienen mecanismo en la base de datos.** Las hace cumplir el módulo de planes, con la suite `estados-plan`. **Un `CHECK` no puede expresar una transición**: es de fila y no ve el valor anterior — el mismo límite que ya está declarado para des-anular un procedimiento (`ARQUITECTURA.md` §10.5, pendiente #12). Solo un trigger lo ataría, y el proyecto no usa triggers.
>
> O sea: a diferencia del dinero y del odontograma, **esto es una regla probada, no un imposible.** Es la **pendiente #17**. Se dice acá porque el peor resultado sería que un agente lea "prohibida" y crea que la base lo protege.

- `plan_item_dientes` es PUENTE_EDITABLE con `DELETE`: el privilegio no distingue un borrador de un plan aceptado. Mismo pendiente #17.
- **Lo que sí quedó cerrado por privilegio** es el dinero: `plan_items` pasó a PARCIALMENTE_INMUTABLE (`ARQUITECTURA.md` §10.6), así que `precioUnitarioCentavos` y los snapshots **no se pueden escribir**, ni siquiera con un `UPDATE` de aspecto razonable. Eso era un hueco real: el ADR-006 protegía del *join*, no del *update*.

## Costo de revertir

**Bajo hoy: no hay código ni base.** Cambiar un nombre de estado es editar un documento.

**Después: migración de datos.** Los estados son columnas con valores escritos en filas reales; renombrar `PROPUESTO` exige backfill, y agregar o quitar una transición exige revisar cada fila que pasó por ella. Por eso `FLUJO-DE-DESARROLLO.md` §5 exige autorización explícita para tocar estos enums.
