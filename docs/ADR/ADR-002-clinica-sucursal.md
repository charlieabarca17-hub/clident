# ADR-002 — `Clinica` y `Sucursal` desde el inicio

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 0

## Contexto

CLIDENT nace como producto multi-clínica. Algunas clínicas odontológicas salvadoreñas tienen varias sedes:

```
Clínica Dental Sonríe
├── Sucursal Escalón
├── Sucursal Santa Tecla
└── Sucursal San Salvador
```

La pregunta del Ciclo 0: ¿conviene introducir `Sucursal` ahora, o esperar a que un cliente la pida?

## Decisión

**Crear la entidad `Sucursal` desde la primera migración**, con **una fila "Sede principal" autocreada por clínica** y **sin ninguna interfaz de sucursales en el MVP**. El usuario nunca ve la palabra "sucursal".

`sucursalId` va **solo donde el lugar físico cambia el significado del dato**:

| Lleva `sucursalId` | No lleva |
|---|---|
| Citas | Paciente |
| Cargos, pagos, cortes de caja | Expediente |
| Inventario | Odontograma |
| Procedimientos realizados | Diagnósticos |
| | Planes de tratamiento |

## Alternativas descartadas

**No crear `Sucursal`; agregarla cuando un cliente la pida.** Descartada por una asimetría que no es de gusto arquitectónico:

- Agregar la **columna** después es fácil: una migración aditiva.
- Pero **el dato histórico es irrecuperable.** Si Clínica Sonríe usa CLIDENT un año con tres sedes y las citas no guardaron dónde ocurrieron, no existe forma de reconstruirlo — **ni preguntándole a la clínica**. Se pierde para siempre el corte de caja por sede, la ocupación por local y el inventario por sucursal.

Una columna se agrega en una migración. Un año de historia no se inventa.

**Poner `sucursalId` en todas las tablas, incluido `Paciente`.** Descartada: atar el paciente a una sucursal **fragmenta la historia clínica**. El odontólogo de Santa Tecla no vería lo que se le hizo al paciente en Escalón. Eso es exactamente lo contrario de para qué sirve un expediente.

**Implementar la lógica multi-sucursal completa ahora** (selector de sede, permisos por sede, agenda por sede, caja por sede). Descartada: ese es el trabajo caro, y es igual de caro cuando se haga. Lo que no se puede posponer es la **columna**, porque de ella depende el dato histórico.

## Consecuencias

**A favor:**
- El dato de "dónde ocurrió esto" se captura desde el día 1, aunque nadie lo mire todavía.
- El costo hoy es cerca de un día de trabajo y **cero complejidad visible** para el usuario.
- Cuando una clínica pida multi-sede, existe un año de historia real que mostrarle.

**En contra:**
- Una tabla y una fila sembrada que nadie usa durante meses.
- Cada entidad ligada a un lugar carga una FK más.

**Consecuencia que importa y es fácil de olvidar:**

> **La regla de no-doble-booking es por ODONTÓLOGO, no por sucursal.** Un dentista no puede estar en Escalón y Santa Tecla a las 10:00. **La sucursal no relaja la física.** El constraint `EXCLUDE` (ADR-008) no incluye `sucursal_id`, y eso es deliberado.

## Costo de revertir

**Bajo si se quita, altísimo si se agrega tarde.** Quitar `Sucursal` sería una migración aditiva inversa sobre datos que nadie usa. Agregarla después es imposible de hacer bien: la columna se agrega, pero el año de historia sin sede no se recupera.

Es exactamente por esa asimetría que se decidió crearla ya.
