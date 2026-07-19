# ADR-017 — Precio acordado por paciente y cobro único por tratamiento

- **Estado:** Aceptado
- **Fecha:** 2026-07-19
- **Ciclo:** 15
- **Decidido por:** Carlos
- **Relacionado:** ADR-006, ADR-007, ADR-009, ADR-016

## Contexto

El catálogo de la clínica necesita un precio de referencia, pero Carlos decidió
que cada odontólogo pueda acordar un precio distinto para cada paciente al
preparar su plan. Además, un tratamiento de $150 que requiere tres sesiones
debe costar $150 en total, no $450.

El diseño anterior copiaba automáticamente el precio de catálogo al `PlanItem`
y Caja trabajaba por `Procedimiento`. En tratamientos multisesión eso ofrecía
varios caminos para cobrar el mismo precio total.

## Decisión

1. `Tratamiento.precioListaCentavos` es una **referencia visual**, no el monto
   obligatorio.
2. Al agregar un tratamiento, el odontólogo escribe el precio acordado para ese
   paciente. Se guarda en `PlanItem.precioUnitarioCentavos`, junto con el
   descuento, y ambos quedan inmutables.
3. Ese precio es el **total del tratamiento completo**, sin importar cuántas
   sesiones clínicas requiera.
4. Caja cobra el `PlanItem`, no cada sesión: puede crear un cargo directo o un
   calendario de cuotas, nunca ambos a la vez. La suma de cuotas debe ser
   exactamente el total acordado.
5. Para conservar la historia clínica, la primera sesión realizada lleva el
   total final en `Procedimiento.precioAplicadoCentavos`; las sesiones
   posteriores llevan cero y se muestran como incluidas en el total.
6. Crear cargos sigue siendo una acción humana exclusiva del módulo Caja. Ni
   aceptar el plan ni registrar una sesión crea deuda automáticamente.

Dos índices parciales protegen las carreras concurrentes: solo puede existir un
cargo directo vigente por `PlanItem`, y solo una sesión realizada con precio
positivo por `PlanItem`.

## Alternativas descartadas

**Cobrar el precio completo por sesión.** Cobra $450 por una endodoncia acordada
en $150 y contradice directamente la decisión comercial.

**Repartir el precio entre sesiones.** Exige saber por adelantado cuántas habrá,
genera residuos de centavos y obliga a recalcular historia si el tratamiento
necesita una sesión adicional.

**Mantener precios cerrados de catálogo.** No permite que el odontólogo acuerde
un monto distinto según el caso concreto del paciente.

**Dejar que Caja vuelva a escribir el precio.** Crea dos fuentes de verdad y
permite cobrar algo diferente de lo que el paciente aceptó.

## Consecuencias

- Dos pacientes pueden recibir el mismo tratamiento con precios diferentes.
- Cambiar el catálogo no altera planes existentes; se conserva el principio de
  snapshot del ADR-006, pero cambia el origen del monto.
- Todas las sesiones quedan registradas, pero Caja ve una sola unidad cobrable.
- Corregir un precio acordado exige anular/recrear el ítem antes de aceptarlo;
  no se reescribe la oferta histórica.
- El ADR-006 queda superseded parcialmente solo donde decía que el monto se
  copiaba automáticamente del catálogo. Nombre, código e inmutabilidad siguen
  vigentes.

## Costo de revertir

Alto después de operar: cambiar la unidad de cobro requeriría reinterpretar
planes, sesiones, cargos y calendarios ya creados.
