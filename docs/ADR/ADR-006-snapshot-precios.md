# ADR-006 — Snapshot histórico de tratamientos y precios

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 0

## Contexto

Existe un catálogo maestro de tratamientos por clínica, con precio de lista editable. Los pacientes tienen planes de tratamiento con precios, y procedimientos realizados con precios aplicados.

Requisito del propietario, textual: *"El precio registrado en un plan debe conservarse históricamente. Si posteriormente cambia el precio del catálogo maestro: NO modificar los planes ya creados."*

Un plan es un compromiso con un paciente. Si en marzo se le presupuestó una corona a $300 y en junio la clínica sube a $380, ese paciente presupuestó $300. Si el sistema recalculara, el paciente vería un número distinto al que se le dijo y **la clínica no tendría cómo demostrar qué ofreció ni cuándo** — destruiría la prueba de la oferta.

## Decisión

**Copiar (congelar) el precio, el nombre y el código del tratamiento al momento de crear el `PlanItem`.**

```prisma
model PlanItem {
  tratamientoId String              // referencia INFORMATIVA. NO se usa para calcular precio.

  // ───── SNAPSHOT AL AGREGAR AL PLAN ─────
  tratamientoCodigo      String     // copiado
  tratamientoNombre      String     // copiado
  precioUnitarioCentavos Int        // copiado. FUENTE DE VERDAD del precio del plan.
  cantidad               Int
  descuentoCentavos      Int
  totalCentavos          Int        // calculado al escribir
  // ────────────────────────────────────────
}
```

**La regla, redactada para que un agente no la pueda pasar por alto** (va en `CLAUDE.md`, en `REGLAS-DE-NEGOCIO.md` y como comentario sobre el campo):

> `Tratamiento.precioListaCentavos` se lee **exactamente una vez**: al crear un `PlanItem`. Después, el precio del plan es `PlanItem.precioUnitarioCentavos`. **Cualquier consulta que haga join de `PlanItem` a `Tratamiento` para mostrar o calcular un precio es un bug.** Cambiar el precio del catálogo nunca debe alterar un plan existente — **ni siquiera uno en `BORRADOR`**.

El mismo patrón aplica en cascada: `Procedimiento.precioAplicadoCentavos` y `LineaCargo.precioUnitarioCentavos` también son snapshots. Un procedimiento ya cobrado no cambia de precio porque cambie el plan ni el catálogo.

**También se congelan nombre y código:** renombrar "Resina" → "Restauración con resina compuesta" no debe reescribir presupuestos que el paciente ya firmó.

**Desactivar un tratamiento** (`activo = false`) solo lo saca del selector. **Nunca afecta planes existentes.**

## Alternativas descartadas

**Join a `Tratamiento` para leer el precio.** El modelo normalizado, "correcto" según los libros. Descartada: reescribe la historia cada vez que cambia un precio.

**Tabla de historial de precios** (`PrecioTratamiento` con vigencia desde/hasta, y el plan resolviendo el precio por fecha). Descartada por tres razones: (1) obliga a que cada lectura de precio haga una consulta temporal, y un agente que la escriba mal produce un error de dinero silencioso; (2) no captura el nombre ni las condiciones del momento; (3) no soporta el caso real del descuento negociado, donde el precio de *ese* plan nunca estuvo en ninguna tabla de precios.

**Versionar el `Tratamiento` completo** (fila nueva por cambio, el plan apunta a la versión). Descartada: convierte el catálogo en append-only y complica el CRUD que la clínica usa a diario, para resolver algo que tres columnas copiadas resuelven mejor.

**Congelar solo el precio, no el nombre.** Descartada: presupuestos viejos mostrarían nombres nuevos. Media solución.

## Consecuencias

**A favor:**
- Cambiar el catálogo **no puede** afectar planes existentes: el plan ya no mira el catálogo. No es que se evite el join — es que el precio está en otro lado.
- Los reportes históricos reflejan los precios de entonces.
- El descuento negociado caso por caso funciona sin ningún mecanismo extra.
- Se conserva la prueba de qué se le ofreció al paciente y cuándo.

**En contra:**
- Datos duplicados: `tratamientoNombre` vive en el catálogo y copiado en cada `PlanItem`.
- Si la clínica corrige un **error tipográfico** en el nombre de un tratamiento, los planes viejos conservan el nombre con el error. Aceptado: es el precio de no reescribir la historia.

**Frágil — y este es el riesgo real:**

> **Los campos snapshot invitan a refactors "útiles".** Un agente de IA va a ver `tratamientoNombre` duplicado, va a pensar "esto está desnormalizado", y lo va a "arreglar" con un join. **Ese es exactamente el bug.**

**Mitigaciones:**
1. Comentario ruidoso sobre cada campo snapshot.
2. La regla, textual, en `CLAUDE.md` y `REGLAS-DE-NEGOCIO.md`.
3. **Prueba de integración obligatoria:** crear tratamiento a $100 → agregar a plan → cambiar catálogo a $150 → afirmar que el ítem sigue en $100 y el total no cambió. **Incluye el caso `BORRADOR`** (el que la gente asume que "debería" actualizarse). Verifica también nombre y código, y que un procedimiento cobrado no cambie.

## Costo de revertir

**Alto y con pérdida.** Quitar los snapshots significaría que los planes vuelvan a leer el catálogo — o sea, perder el precio histórico de todo lo ya presupuestado. Los datos congelados no se pueden reconstruir desde el catálogo actual.

Si un agente futuro propone "normalizar" estos campos, **este documento es la respuesta.**
