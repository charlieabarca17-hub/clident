# ADR-016 — Forma del cobro, cuotas y resolución de las pendientes de Caja

- **Estado:** Aceptado — superseded parcialmente por ADR-017 (#18 y unidad de cobro)
- **Fecha:** 2026-07-18
- **Ciclo:** Fase 9
- **Decidido por:** Carlos (pendiente #3 y aplazamientos); mecanismos por diseño
- **Relacionado:** ADR-006, ADR-007, ADR-009, ADR-012, ADR-013

## Contexto

> **Actualización, ADR-017:** el filtro de #18 se convirtió en un candado real:
> cargo directo y cuotas comparten el `PlanItem`, y las sesiones ya no son
> unidades cobrables independientes.

ARQUITECTURA §19 marcaba ocho decisiones "antes de Fase 9". Carlos resolvió la
tributaria/comercial (#3) y confirmó tres aplazamientos (#2, #7, #9). Las demás
son de mecanismo y se resuelven aquí con los patrones ya establecidos.

## Decisiones

### #3 — Forma del cobro: sin IVA, con descuento por línea (decisión de Carlos)

`LineaCargo` lleva `precioOriginalCentavos`, `descuentoCentavos` y
`montoCentavos`, con `CHECK monto = original − descuento`. El descuento de
mostrador queda registrado y visible. **El IVA 13% no se modela**: CLAUDE.md
§15 prohíbe inventar lógica tributaria y el DTE no está en ninguna fase. Cuando
llegue el DTE, el impuesto entra como columnas nuevas — aditivo, sin reescribir
lo cobrado. `Cargo.montoCentavos = Σ(monto de sus líneas)`, y la consulta de
reconciliación #4 entra al criterio de salida: **todo cargo tiene al menos una
línea** (las cuotas llevan una línea sin procedimiento).

### #15 — Doble cobro: puntero mutable en `procedimientos`, no UNIQUE en líneas

El `@@unique([procedimientoId])` de `LineaCargo` era incompatible con líneas
append-only: la línea de un cargo anulado ocupaba el slot para siempre. Se
reemplaza por una columna **mutable** `procedimientos.cargo_id` (se agrega al
`GRANT UPDATE` por columna):

- Cobrar = `UPDATE procedimientos SET cargo_id = $cargo WHERE id = $id AND
  cargo_id IS NULL` — el reclamo es atómico; el segundo cobro no encuentra fila.
- Anular el cargo libera el puntero (`cargo_id = NULL`) y el procedimiento
  vuelve a ser cobrable. Las líneas del cargo anulado quedan como historia.
- "Realizados sin cargo" = `estado = REALIZADO AND cargo_id IS NULL`.

`LineaCargo.procedimientoId` queda como referencia informativa, sin unicidad.

### #16 — Las cuotas se cuelgan del `PlanItem`

`Cargo` gana `planItemId` (nullable, FK compuesta) y `cuotaNumero` (nullable,
`CHECK` de coherencia y unicidad `[clinicaId, planItemId, cuotaNumero]`). "Las
cuotas de esta ortodoncia" es una consulta, no una adivinanza; cancelar la
ortodoncia identifica sus cuotas sin tocar la corona del mismo paciente.

### #18 — Los dos canales de la ortodoncia

Con #16 resuelto, la lista "realizados sin cargo" **excluye** los
procedimientos cuyo `PlanItem` ya tiene cargos de cuota vigentes: las
activaciones mensuales no aparecen como cobrables cuando el tratamiento se
cobra por calendario. Es un filtro de lista de trabajo (la cajera decide),
no un candado de dinero.

### #12 — Des-anular: prevención imposible sin triggers → detección

Un `CHECK` no ve el valor anterior y el proyecto no usa triggers, así que
des-anular un pago es *posible* a nivel de privilegios. La mitigación es una
**quinta consulta de reconciliación**: la auditoría (append-only) registra cada
`CARGO_ANULADO`/`PAGO_ANULADO`; toda fila cuya anulación conste en auditoría
pero tenga `anulado_en IS NULL` es una resurrección y sale en la consulta.
Detección barata sobre un registro que no se puede borrar.

### #19 — Fecha de cuota mal tecleada

`CHECK` de rango sobre `fecha_exigible_en` (2020-01-01 a hoy + 10 años) y la
pantalla de cuotas muestra **todas** las fechas generadas antes de confirmar.

### Aplazados por Carlos (aditivos, con ciclo propio futuro)

- **#2 Corte de caja** (apertura/cierre/arqueo): no modelado.
- **#9 Devolución de efectivo**: el crédito a favor se muestra; la salida
  física de dinero no existe como entidad todavía.
- **#7 Umbral de mora**: la mecánica queda (`vencido = fecha < hoy`); el número
  de días de gracia lo fija Carlos después.

### Método de pago

`Pago.metodo` (EFECTIVO | TARJETA | TRANSFERENCIA | CHEQUE | OTRO) +
`referencia` opcional. Necesario para el desglose del día en Caja; sin
pretensión contable.

## Consecuencias

La forma de `Cargo`/`LineaCargo` queda fijada antes del primer dato financiero.
El IVA llegará como cambio aditivo. La reconciliación pasa de 4 a 5 consultas y
la #4 entra al criterio de salida. La lista canónica de columnas mutables de
`procedimientos` (§10.5) gana `cargo_id`.

## Costo de revertir

Alto en la forma de línea (migración de datos financieros — por eso se decidió
ahora). Bajo en los aplazamientos: todos son aditivos.
