# ADR-007 — La cuenta por cobrar se registra exclusivamente en `Cargo`

- **Estado:** Aceptado — **superseded PARCIALMENTE por [ADR-013](ADR-013-exigibilidad-de-cargos.md)** (solo la definición de "saldo pendiente")
- **Fecha:** 2026-07-17
- **Ciclo:** 0

> **Qué sigue vigente de este ADR: todo lo importante.** Solo `crearCargo()` incorpora una obligación a las cuentas, desde Caja, invocada por un humano; presupuestar, aceptar y realizar **no** lo hacen; no hay ruta automática. Nada de eso cambió, y nada de eso debe cambiar.
>
> **Precisión conceptual (Ciclo 1).** Este ADR se llamaba *"La deuda nace exclusivamente en `Cargo`"* y afirmaba que *"la deuda existe **si y solo si** existe una fila de `Cargo`"*. **Eso era una afirmación jurídica que a CLIDENT no le toca hacer.** Cuándo nace una obligación entre la clínica y el paciente lo deciden el contrato, el consentimiento firmado, la ley y eventualmente un juez — un plan de ortodoncia firmado puede obligar desde el día de la firma, y ningún software cambia eso. **Lo que este ADR decide, y lo único que puede decidir, es cuándo CLIDENT reconoce una cuenta por cobrar.** El comportamiento del sistema es idéntico; la afirmación se acota a su competencia. *(El nombre del archivo se conserva para no romper enlaces.)*
>
> **Qué se superseded: una sola fila de la tabla de abajo** — *"Saldo pendiente = `Cargo.montoCentavos − montoAplicadoCentavos`"*. Con la ortodoncia por cuotas, esa fórmula responde *"debe $1,080 hoy"* a un paciente que debe $60. **Este ADR respondió *cuándo se registra*; nunca respondió *cuándo es exigible*, y asumió que eran la misma pregunta.** El ADR-013 las separa: hay cuatro saldos y el del sistema es el **exigible**.

## Contexto

Requisito del propietario, textual: *"Un tratamiento presupuestado NO debe convertirse automáticamente en deuda."*

La arquitectura financiera debe distinguir cinco cosas que los sistemas de clínicas mezclan sistemáticamente: presupuestado, aceptado, realizado, facturado/cobrado, pagado.

El error clásico —y la razón de este ADR— es que un plan aceptado genere automáticamente una cuenta por cobrar. Cuando eso pasa, el estado de cuenta refleja plata que nadie debe, las cuentas por cobrar son ficción, y cualquier decisión financiera tomada sobre esos números está equivocada.

## Decisión

**Una obligación entra al estado de cuenta del paciente y a las cuentas por cobrar si y solo si existe una fila de `Cargo`. No hay ningún otro camino.**

| Concepto | Dónde vive | ¿Está en la cuenta por cobrar? |
|---|---|---|
| Presupuestado | `PlanItem.estado = PROPUESTO` | ❌ No |
| Aceptado | `PlanItem.estado = ACEPTADO` | ❌ **No** |
| Realizado | `Procedimiento.estado = REALIZADO` | ❌ **No** |
| Facturado / cobrado | `Cargo` creado explícitamente | ✅ **Aquí nace** |
| Pagado | `AplicacionPago` cubre el `Cargo` | — |
| ~~Saldo pendiente~~ → **saldo exigible** (ADR-013) | `Σ(monto − aplicado)` con `anuladoEn IS NULL` **y `fechaExigibleEn <= hoy`** | ✅ |

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
- **Crédito a favor** = `pago.montoCentavos − pago.montoAplicadoCentavos`. El esquema ya permite un pago con menos aplicaciones que su monto. **Cero tablas nuevas después.**
- **Aplicar a documentos fiscales** = aplicar a un `Cargo` que lleva `documentoFiscalId`.

> **Corrección del Ciclo 1 (auditoría).** El seam de crédito a favor **descansaba en una columna que nunca se declaró**: `pago.montoAplicado` se nombraba acá y en `ARQUITECTURA.md` §12.4, pero el único contador declarado estaba en `cargos`. Sin él, la fórmula daba siempre el monto completo del pago. Peor: sin `CHECK` del lado del pago, **un pago de $100 se podía repartir en cinco cargos de $100 y cada aplicación pasaba su `CHECK` individual** — $500 aplicados de $100 que entraron. Ahora hay **dos contadores y dos `CHECK`** (`ARQUITECTURA.md` §13.1). La decisión de este ADR no cambia; se corrige el mecanismo que la sostenía.

## Ortodoncia por cuotas — resuelta por el ADR-013

**Carlos confirmó en el Ciclo 1 que la ortodoncia es ingreso importante**, y eso tensionó este ADR hasta obligar a un ADR nuevo. El desenlace, para el agente que llegue acá primero:

- **Este ADR sobrevive entero en lo que decidió.** **Aceptar el plan no crea nada.** Después, **una persona autorizada de Caja crea expresamente el calendario**: 18 `Cargo`, una fila por cuota. Sin ruta automática. Sin job. **Son dos acciones separadas y auditadas por separado** (`REGLAS-DE-NEGOCIO.md` §1.9) — la aceptación es clínica/comercial, la generación de cuotas es financiera.
- **No existe —ni debe existir— una variante automática de `crearCargo()` "para cuotas".** El calendario es esa misma función llamada N veces por alguien que apretó un botón. Una versión automática sería la excepción que se come esta regla, justo en el caso más grande de la clínica.
- **Lo que se agregó es `Cargo.fechaExigibleEn`** y la separación entre *registrarse* y *vencer*, que este ADR nunca hizo porque asumió que eran lo mismo.
- **Lo que se superseded es la fórmula del saldo**, y solo eso. Ver [ADR-013](ADR-013-exigibilidad-de-cargos.md).

`Tratamiento.permitePlanDePagos` **se quitó**: era una bandera booleana sin ningún mecanismo detrás, y el mecanismo real vive acá, en Caja, no en el catálogo.

## Costo de revertir

**Medio.** Agregar generación automática de cargos sería sumar una llamada en el flujo de aceptación de plan o de registro de procedimiento — técnicamente trivial.

**Pero sería un error de negocio, no una mejora técnica**, y contaminaría las cuentas por cobrar con deuda inventada. Si alguien lo propone, hay que escribir un ADR nuevo que supersede a éste explicando por qué la decisión humana en Caja dejó de importar.
