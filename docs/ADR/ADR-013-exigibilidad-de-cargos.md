# ADR-013 — Exigibilidad: nacer no es lo mismo que vencer

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 1
- **Supersede parcialmente:** [ADR-007](ADR-007-deuda-nace-en-cargo.md) — solo la definición de "saldo". **La regla de dónde se registra la cuenta por cobrar queda intacta.**
- **Relacionado:** ADR-009 (centavos enteros)

## Contexto

Carlos confirmó en el Ciclo 1 que **la ortodoncia es ingreso importante** para la clínica. Eso son 18–24 cuotas mensuales de ~$60: **obligaciones que se vuelven exigibles por calendario, sin que nadie haya hecho un procedimiento ese mes.**

El ADR-007 estableció que una obligación entra a las cuentas por cobrar *"si y solo si existe una fila de `Cargo`"* y que *"no existe ninguna ruta automática; solo `crearCargo()`, invocada desde Caja **por un usuario**"*. Las dos salidas ingenuas contradicen algo:

1. **Un humano crea el cargo cada mes, por cada paciente.** Respeta el ADR-007 al pie de la letra. Pero con 40 pacientes de ortodoncia son 40 clics mensuales para siempre, y **el mes que alguien se olvide, el sistema dirá —con toda corrección según su diseño— que el paciente no debe nada.** La clínica no cobra y el estado de cuenta miente por omisión.
2. **Ruta automática de plan a cargos programados.** Es exactamente lo que el ADR-007 descarta tres veces, con argumentos que siguen siendo válidos para todo lo demás.

**Y hay un problema más profundo que ninguna de las dos resuelve.** El ADR-007 define:

> `Saldo pendiente = Cargo.montoCentavos − montoAplicadoCentavos`

Con 18 cuotas creadas por adelantado, esa fórmula responde **"debe $1,080 hoy"** a un paciente que debe $60. No es un detalle de presentación: las cuentas por cobrar de la clínica serían ficción, la mora sería falsa, y cualquier decisión financiera tomada sobre esos números sería equivocada. **Es el mismo error que el ADR-007 existe para impedir —cuentas por cobrar que reflejan plata que nadie debe— disfrazado de calendario.**

El ADR-007 respondió *cuándo nace* una deuda. **Nunca respondió *cuándo es exigible*.** Asumió que eran la misma pregunta, y con ortodoncia dejan de serlo.

## Decisión

**`cargos.fecha_exigible_en date NOT NULL`, sin `DEFAULT`, cuatro saldos derivados, y ningún estado nuevo.**

**Sin `DEFAULT`, deliberadamente.** Quien crea un cargo dice cuándo vence — que es la tesis misma de este ADR: si un default los iguala, *registrarse* y *vencer* vuelven a ser lo mismo y la distinción se hace opcional. Y un default es **fallo silencioso**: si un bug de mapeo hace que Prisma omita el campo en algunas de las 18 cuotas, esas nacen exigibles hoy y el paciente aparece debiendo de más, sin que nada chiste. Sin default, es un `23502` en el primer `INSERT` — el mismo argumento con el que el [ADR-012](ADR-012-modelo-de-privilegios.md) invirtió el default de privilegios en este mismo ciclo.

### Dos acciones, no una — y esto NO es un detalle de redacción

```
El paciente acepta el plan   →  PlanTratamiento: ACEPTADO
                                Cargos creados: NINGUNO
      ↓  (otra persona, otro momento, otra transacción)
Caja crea el calendario      →  18 Cargo, cada uno con su fechaExigibleEn
```

**Aceptar el plan NO crea las cuotas.** Después de la aceptación, **una persona autorizada de Caja crea expresamente el calendario financiero**. La aceptación clínica/comercial y la generación financiera son **operaciones distintas, separadas y auditables por separado** (`REGLAS-DE-NEGOCIO.md` §1.9).

**Por qué la distinción es sustantiva y no cosmética:** si aceptar creara las cuotas, **aceptar crearía cuenta por cobrar** — y la regla del ADR-007 se volvería falsa justo en el caso más grande de la clínica. Sería la excepción que se come la regla. Y hay una razón práctica: **el odontólogo que acepta el plan en el sillón no decide los términos financieros** —18 cuotas o 24, con prima o sin, arrancando este mes o el otro—. Eso se conversa en Caja, y a veces días después.

**No existe ni debe existir una variante automática de `crearCargo()` "para cuotas".** El calendario es esa misma función llamada 18 veces por alguien que apretó un botón, con la misma auditoría por fila.

### Los cuatro saldos

Todos con `anulado_en IS NULL`, agregados en `bigint` (ADR-009), con `$hoy = (now() AT TIME ZONE 'America/El_Salvador')::date`:

| Saldo | Filtro adicional |
|---|---|
| Contractual | — |
| **Exigible** — *el* saldo del sistema | `fecha_exigible_en <= $hoy` |
| Vencido (mora) | `fecha_exigible_en < $hoy` |
| Futuro | `fecha_exigible_en > $hoy` |

**Cuentas por cobrar = exigible. Nunca el total cargado.**

> **El primer saldo NO se llama "contractual".** Se llamó así en el borrador de este ADR y era un error del mismo tipo que el ciclo vino a corregir: ese número es `Σ` de los `Cargo` **que Caja creó**, no de lo que el paciente firmó. Entre la aceptación del plan y la creación del calendario vale **$0** mientras existe un contrato firmado por $1,080. **Llamarlo "contractual" era una afirmación sobre el contrato, que es exactamente lo que CLIDENT no hace.**

### `date`, no `timestamptz`

La regla "todo en `timestamptz`" es para **instantes**. Una cuota vence un **día civil**. Un `timestamptz` acá invita al bug de medianoche UTC-6: la cuota del 1.º se volvería exigible a las 6 p.m. del 30.

### `NOT NULL`

Una columna nulable que "significa exigible ya" es exactamente la trampa que el ADR-001 prohíbe para `clinicaId`: el `NULL` que significa algo es por donde se cuelan los bugs.

## Alternativas descartadas

**Un estado `NO_EXIGIBLE` almacenado en `Cargo`.** Tentador y convencional. Descartada: exigiría **un job diario que voltee los estados**, y el job que se olvida —o que falla en silencio un domingo— es exactamente el modo de fallo que este proyecto no se permite. Un cargo cuyo estado dependa de que un proceso corriera anoche no es una garantía: es una esperanza. **"Exigible" es función del tiempo, y el tiempo no se guarda: se consulta.**

**Una tabla `PlanDePagos` con sus cuotas, separada de `Cargo`.** Descartada por duplicar el modelo financiero: habría dos lugares donde vive una obligación de pago, y la pregunta *"¿cuánto debe este paciente?"* tendría que sumar los dos y no olvidarse de ninguno. El ADR-007 existe precisamente para que esa pregunta tenga **una** respuesta.

**Ruta automática plan → cargos.** Descartada: es lo que el ADR-007 prohíbe, y sus argumentos siguen siendo válidos. Este ADR **no** los toca.

**Distribuir los anticipos automáticamente entre cuotas** (la más vencida primero). Descartada: sería **la primera escritura financiera sin humano** en todo el sistema. La UI puede *sugerir*; la persona confirma. Aplicar un pago a un cargo es un acto explícito de Caja y así se queda.

**Dejar el saldo sin calificar y "que la UI filtre".** Descartada: un agente que implemente el ADR-007 literalmente produce el saldo de $1,080, y tendría razón según el documento. Si la fórmula canónica está mal, se arregla la fórmula canónica.

**`permitePlanDePagos` como bandera del catálogo.** Se quita. Era una bandera booleana **sin ningún mecanismo detrás**; el mecanismo real vive en Caja. Una bandera sin punto de aplicación es una trampa para el agente que la vea en seis meses.

## Consecuencias

**A favor:**
- La pregunta *"¿cuánto debe hoy?"* tiene respuesta correcta con ortodoncia, cuotas y anticipos.
- **Nada se automatiza:** la deuda sigue naciendo donde el ADR-007 dice, por decisión humana.
- Sin jobs, sin estados que voltear, sin procesos nocturnos.
- **Cancelar una ortodoncia a mitad compone sin piezas nuevas:** cuotas futuras impagas → anular (contador en 0, pasa directo); cuotas ya pagadas → reversa → crédito a favor → anular.

**En contra:**
- **Hay cuatro saldos donde había uno, y hay que rotularlos bien.** Un reporte que diga "saldo" a secas es ambiguo por diseño. Mitigación: la suite `exigibilidad` fija los cuatro con números concretos.
- **Crear 18 cargos de una vez es un acto grande para un solo clic.** La UI debe mostrar exactamente qué se va a crear antes de confirmarlo.
- Queda abierto el **umbral de mora** (pendiente #7): ¿desde el día siguiente? ¿días de gracia?

**Qué del ADR-007 sobrevive intacto:**
- Una obligación entra a las cuentas por cobrar **si y solo si** existe una fila de `Cargo`. ✅
- Solo `crearCargo()` la crea, desde Caja, invocada por un humano. ✅
- Presupuestar, **aceptar** y realizar **no** la crean. ✅
- No hay ruta automática. **Ni siquiera para las cuotas: aceptar el plan y crear el calendario son dos acciones.** ✅

**Qué se supersede:** únicamente la fila *"Saldo pendiente = `Cargo.montoCentavos − montoAplicadoCentavos`"*. Pasa a ser el **saldo exigible**, y lleva `fecha_exigible_en <= hoy` y `anulado_en IS NULL`.

## Costo de revertir

**Bajo hoy, caro después, pero no catastrófico.** La columna es aditiva y su backfill es trivial (`fecha_exigible_en = fecha de creación` reproduce exactamente el comportamiento viejo).

Lo caro no es la columna: son **los reportes y pantallas ya escritas con "saldo = Σ todo"**, que habría que cazar una por una. Y los estados de cuenta que ya se le mostraron a un paciente **no se corrigen retroactivamente**: el paciente ya vio que debía $1,080.
