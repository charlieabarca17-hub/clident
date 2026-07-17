# ADR-009 — Centavos enteros para dinero

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 0

## Contexto

CLIDENT maneja precios de catálogo, presupuestos, precios aplicados, cargos, pagos y saldos. Moneda: **USD** (El Salvador), 2 decimales, montos de clínica dental.

El stack es Next.js + Prisma + PostgreSQL, y los precios cruzan la frontera servidor→cliente en Server Components y Server Actions.

Tres opciones: `Float`, `Decimal` o `Int` en centavos.

`Float` queda descartado sin discusión: `0.1 + 0.2 ≠ 0.3`. Con dinero, no.

La decisión real es **`Decimal` vs `Int`**, y la respuesta "correcta según los libros" es `Decimal`.

## Decisión

**`Int` en centavos. Todo monto. Sin excepciones.**

- Los campos terminan en `Centavos`: `precioUnitarioCentavos`, `montoCentavos`, `descuentoCentavos`. **Si no termina en `Centavos`, no es dinero.**
- **`src/lib/money.ts` es el único archivo del proyecto que divide entre 100**, y solo para mostrar.
- Cualquier **agregado** (sumas de reportes) se calcula como `bigint` en SQL.

## Alternativas descartadas

### `Decimal` (`@db.Decimal(10,2)`) — la opción "correcta según los libros"

Descartada, en este orden de importancia:

**1. Prisma devuelve `Decimal` como instancia de `Decimal.js`, que NO es serializable a través de la frontera servidor→cliente de Next.js.**

Éste es el argumento decisivo, y es específico de este stack. Cada Server Component y cada Server Action que devuelva un precio necesitaría conversión manual (`.toNumber()` / `.toString()`). Los agentes de IA lo olvidan **constantemente**, y el fallo no es un error de compilación: es un crash en runtime o —peor— **`[object Object]` renderizado en un campo de precio**, en producción, delante de un paciente.

`Int` cruza la frontera gratis.

**2. `Int` hace imposible la contaminación por float.** No hay decimales en el sistema, así que no existe el `+ 0.1 + 0.2`. La conversión ocurre en un solo archivo.

**3. `Decimal` compra exactitud para aritmética multi-paso que acá no existe.** Todo cálculo es sumar y restar centavos, más una multiplicación por cantidad. No hay tasas compuestas, ni divisiones encadenadas, ni conversión de monedas.

**4. Magnitudes.** `Int` topa en **$21,474,836.47** por fila. Un cargo de clínica dental no se acerca ni de lejos.

### `Float` / `Double`

Descartado sin discusión. `0.1 + 0.2 = 0.30000000000000004`. Con dinero es incorrecto y produce centavos fantasma en los saldos.

### Números decimales en TypeScript con redondeo al escribir

El peor de los mundos: la fragilidad del float con la ilusión de precisión.

### Una librería de dinero (dinero.js, big.js)

Descartada: es una dependencia más para mantener y para que los agentes entiendan, cuando el problema real —serialización— no lo resuelve. `money.ts` con dos funciones probadas hace lo mismo.

## Consecuencias

**A favor:**
- Los precios cruzan la frontera servidor→cliente sin ninguna ceremonia.
- Imposible contaminar con float.
- Las sumas y restas de centavos son exactas por construcción.
- Los `CHECK` de sobreaplicación (`monto_aplicado_centavos BETWEEN 0 AND monto_centavos`) son aritmética entera trivial.

**En contra — el trade-off que se acepta explícitamente:**

> **Descuentos porcentuales e IVA futuro (13% en El Salvador) exigen una decisión explícita de redondeo.**

`src/lib/money.ts` la posee: `aplicarPorcentaje(centavos, pct)` con redondeo half-up, con prueba unitaria. **Una función probada versus un riesgo de serialización en todo el código.**

**En contra (menor):**
- Un `Int` mal leído se ve como 100× el precio real. Mitigación: la convención de nombre `...Centavos` es obligatoria, y `money.ts` es el único que convierte.
- Los agregados grandes deben ser `bigint` en SQL. Una línea de nota en `money.ts`.

**Nota sobre el IVA:** la decisión de si los precios llevan IVA incluido o agregado sigue **pendiente** (`ARQUITECTURA.md` §19). Es independiente de este ADR: se resuelve igual con centavos enteros, pero define si `Cargo` necesita subtotal/impuesto/total. **Es la decisión pendiente más cara del proyecto:** decidirla tarde significa migrar datos financieros.

## Costo de revertir

**Alto.** Cambiar a `Decimal` significaría migrar cada columna de dinero de cada tabla, y agregar conversión manual en cada punto que cruce la frontera servidor→cliente — que es exactamente lo que este ADR existe para evitar.

No se revierte sin un motivo nuevo y fuerte. "Decimal es lo correcto para dinero" no es un motivo nuevo: ya se consideró y se descartó por una razón concreta de este stack.
