# ADR-007 — La deuda nace exclusivamente en `Cargo`

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 0

## Contexto

Requisito del propietario, textual: *"Un tratamiento presupuestado NO debe convertirse automáticamente en deuda."*

La arquitectura financiera debe distinguir cinco cosas que los sistemas de clínicas mezclan sistemáticamente: presupuestado, aceptado, realizado, facturado/cobrado, pagado.

El error clásico —y la razón de este ADR— es que un plan aceptado genere automáticamente una cuenta por cobrar. Cuando eso pasa, el estado de cuenta refleja plata que nadie debe, las cuentas por cobrar son ficción, y cualquier decisión financiera tomada sobre esos números está equivocada.

## Decisión

**La deuda existe si y solo si existe una fila de `Cargo`. No hay ningún otro camino.**

| Concepto | Dónde vive | ¿Es deuda? |
|---|---|---|
| Presupuestado | `PlanItem.estado = PENDIENTE` | ❌ No |
| Aceptado | `PlanItem.estado = ACEPTADO` | ❌ **No** |
| Realizado | `Procedimiento.estado = REALIZADO` | ❌ **No** |
| Facturado / cobrado | `Cargo` creado explícitamente | ✅ **Aquí nace** |
| Pagado | `AplicacionPago` cubre el `Cargo` | — |
| Saldo pendiente | `Cargo.montoCentavos − montoAplicadoCentavos` | ✅ |

**No existe ninguna ruta automática de plan o procedimiento a `Cargo`.** Solo `crearCargo(ctx, ...)`, invocada desde el módulo de Caja por un usuario con permiso `caja:write`.

**Cómo se hace estructural:** hay **una sola función** en todo el código capaz de crear un cargo, y **nada más en el código la importa**. No es una convención: es la ausencia de cualquier otro camino.

- Aceptar un plan no crea cargo.
- Realizar un procedimiento no crea cargo.
- La pantalla de Caja muestra "procedimientos realizados sin cargo" como **lista de trabajo**, y un humano decide cuáles trasladar.

**Por qué esto importa clínicamente, no solo contablemente:** un procedimiento puede ser una cortesía, una garantía, la corrección de un trabajo previo, parte de un paquete ya cobrado, o algo que la clínica decidió no cobrar. **Cobrar es una decisión humana, no una consecuencia mecánica de haber trabajado.**

**Garantías en la base de datos:**

```sql
-- Un procedimiento no se cobra dos veces
ALTER TABLE lineas_cargo ADD CONSTRAINT ... UNIQUE (procedimiento_id);

-- Sobreaplicar un pago es imposible, no "está validado"
ALTER TABLE cargos ADD CONSTRAINT cargo_no_sobreaplicado
  CHECK (monto_aplicado_centavos BETWEEN 0 AND monto_centavos);
```

## Alternativas descartadas

**Aceptar un plan genera los cargos automáticamente.** Lo que hacen muchos sistemas. Descartada: el paciente puede aceptar y nunca presentarse, aceptar y hacerse la mitad, o arrepentirse. Cobrarle por una conversación es incorrecto contable y legalmente.

**Realizar un procedimiento genera el cargo automáticamente.** Más defendible que la anterior, y por eso más peligrosa. Descartada porque elimina la decisión humana en el único punto donde debe existir: cortesías, garantías, correcciones y paquetes dejan de ser expresables, y el cajero termina anulando cargos que el sistema no debió crear. **Anular un cargo mal creado es más caro que crear el cargo que faltaba.**

**Un `Cargo` con estado `BORRADOR` creado automáticamente.** Un compromiso tentador: el sistema propone y el humano confirma. Descartada porque hace ambigua la pregunta "¿esto es deuda?": la respuesta pasaría a depender de un estado en vez de la existencia de la fila. Y en el momento en que alguien escriba un reporte que olvide filtrar por estado, los borradores se vuelven deuda. **La lista "realizados sin cargo" da el mismo beneficio sin crear nada.**

**Un libro mayor de cuenta corriente del paciente** (`PatientAccount` con débitos y créditos). Descartada por sobreingeniería prematura. `Cargo` + `Pago` + `AplicacionPago` cubre pagos parciales, un pago a varios cargos y saldo a favor. El propietario pidió explícitamente no sobrediseñar esto.

## Consecuencias

**A favor:**
- La pregunta "¿por qué este paciente debe $200?" tiene siempre una respuesta única, con fecha, responsable y motivo.
- Las cuentas por cobrar reflejan obligaciones reales.
- Cortesías, garantías y paquetes se expresan sin ningún mecanismo especial: simplemente no se crea el cargo.
- Sobreaplicar y doble-cobrar son imposibles, no validados.

**En contra:**
- Un paso manual: alguien en Caja tiene que trasladar los procedimientos. **Eso es una característica, no un costo.**
- Si nadie lo hace, la clínica no cobra. Mitigación: la lista "realizados sin cargo" es visible y es la pantalla principal de Caja.

**Seams futuros ya abiertos sin construir nada:**
- **Crédito a favor** = `pago.monto − pago.montoAplicado`. El esquema ya permite un pago con menos aplicaciones que su monto. **Cero tablas nuevas después.**
- **Aplicar a documentos fiscales** = aplicar a un `Cargo` que lleva `documentoFiscalId`.

## Costo de revertir

**Medio.** Agregar generación automática de cargos sería sumar una llamada en el flujo de aceptación de plan o de registro de procedimiento — técnicamente trivial.

**Pero sería un error de negocio, no una mejora técnica**, y contaminaría las cuentas por cobrar con deuda inventada. Si alguien lo propone, hay que escribir un ADR nuevo que supersede a éste explicando por qué la decisión humana en Caja dejó de importar.
