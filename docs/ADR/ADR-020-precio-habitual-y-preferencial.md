# ADR-020 — Precio habitual por clínica y registro de tarifa preferencial

- **Estado:** Aceptado
- **Fecha:** 2026-09-22
- **Ciclo:** 31
- **Decidido por:** Carlos
- **Supersede parcialmente:** ADR-018 (el catálogo vuelve a tener un precio, con otra forma y otro propósito)
- **Relacionado:** ADR-006 (snapshots), ADR-017 (precio acordado por paciente)

> **Este ADR revierte, en parte, una decisión de hace dos meses.** El ADR-018
> sacó los precios del catálogo y dejó escrito que si alguien proponía
> devolverlos, ese documento era la respuesta. La propuesta llegó, y no de un
> agente sin contexto: de Carlos, con una razón que el ADR-018 no tenía a la
> vista. Se documenta el cambio, no se borra el original.

## Contexto

El ADR-018 (19-jul) eliminó `Tratamiento.precioListaCentavos` con dos argumentos:

1. Un precio guardado en el catálogo se convierte en el valor por defecto del
   formulario, **y un valor por defecto es lo que la gente acepta sin pensar**.
   Eso vuelve teórico el precio acordado por paciente del ADR-017.
2. Carlos vende a clínicas distintas, con precios distintos, y hasta con
   odontólogos que cobran distinto dentro de la misma clínica. Una "lista de
   precios" central presupone algo que no es cierto.

**El segundo argumento sigue en pie y este ADR no lo toca:** el precio que se
agrega es **de cada clínica**, nunca de plataforma. Las plantillas de tratamiento
siguen sin precio.

Lo que cambió es el primero, y cambió por un dato nuevo: **el objetivo de la
clínica no es que el sistema le diga cuánto cobrar, es llevar registro de cuánto
cobró y cuánto se apartó de lo normal.** Sin una referencia guardada, eso es
imposible: `PlanItem.descuentoCentavos` ya existía desde el Ciclo 0 y no servía
de mucho, porque un descuento de $5 es un número suelto que no dice contra qué.

Y hay un costo que el ADR-018 subestimó: **escribir el precio a mano en cada
tratamiento de cada plan**. La auditoría de UX del 2026-09-21 lo marcó como una
de las trabas del flujo más frecuente del sistema.

## Decisión

**El catálogo de cada clínica guarda un precio habitual. El precio del paciente
lo sigue decidiendo una persona, y la diferencia queda registrada.**

1. **`Tratamiento.precioHabitualCentavos`** (`Int?`, de la clínica). Nullable a
   propósito: un tratamiento puede no tener precio habitual todavía, y eso no
   puede bloquear nada. **No se llama `precioLista`**: ese nombre es el de la
   columna que el ADR-018 borró, y reusarlo confundiría dos cosas distintas.
   Las plantillas de plataforma **siguen sin precio**.
2. **Lo edita la clínica en su catálogo**, con `catalogo:write`, como cualquier
   otro campo del tratamiento. Vaciarlo lo deja sin tarifa, que es un estado
   válido y distinto de cero.
3. **Se precarga en el formulario del plan.** Es lo que Carlos decidió: la
   clínica chica necesita velocidad, y escribir el mismo número cien veces es la
   fricción que la aleja del sistema. El campo sigue siendo editable, la
   precarga **no pisa** un precio que la persona ya haya escrito, y lo que el
   odontólogo escriba manda siempre.
4. **`PlanItem.precioHabitualCentavos`** (`Int?`): **snapshot** de lo que era
   habitual **cuando se armó ese plan**. Es la pieza que hace que todo esto
   sirva: si la clínica sube su precio habitual en marzo, lo que se registró como
   preferencial en enero no puede cambiar. Es el mismo razonamiento del ADR-006 y
   la misma prohibición: **ningún cálculo de preferencial hace join a
   `Tratamiento`.**
5. **El snapshot lo escribe el servidor, no el navegador.** `AgregarPlanItemSchema`
   no tiene ese campo: el repositorio lee la tarifa del `Tratamiento` dentro de la
   misma transacción. Si viajara en el request, un cliente podría declarar que lo
   habitual eran $9,999 y falsear cuánto se dio en preferencial (§2.3).
6. **La tarifa preferencial no es un campo, es una diferencia**:
   `precioHabitualCentavos − precioUnitarioCentavos`, cuando el habitual existe y
   es mayor. No se guarda un tercer número que pueda desalinearse de los otros
   dos.

`descuentoCentavos` se conserva como está y **significa otra cosa**: es una
rebaja sobre el precio acordado, dentro del mismo plan. Preferencial es apartarse
del precio habitual de la clínica. Un plan puede tener las dos.

## Por qué esto NO contradice el ADR-017

El ADR-017 no prohibió un precio de referencia: su punto 1 dice, textualmente,
que el precio del catálogo **"es una referencia visual, no el monto
obligatorio"**. Lo que ese ADR puso fuera de discusión es *quién decide*: el
precio del paciente lo escribe el odontólogo en el `PlanItem` y queda inmutable.

Eso no cambia. `precioHabitualCentavos` no participa en ningún cobro: no entra a
`Cargo`, no entra a `LineaCargo`, no entra a `Procedimiento.precioAplicadoCentavos`
y no puede sobrescribir un `PlanItem`. Es una sugerencia que la clínica se hace a
sí misma.

**Visto así, el ADR-020 está más cerca del ADR-017 que el ADR-018:** vuelve a la
referencia no vinculante que el ADR-017 había descrito, con un nombre que no se
confunde con "precio de lista" y con un snapshot que el ADR-017 no tenía.

## Lo que este ADR NO revierte

- **El precio nunca se impone.** El campo es editable y el valor precargado es
  una sugerencia de la clínica a sí misma, no del sistema al profesional.
- **Los snapshots siguen mandando** (ADR-006). `PlanItem`, `Procedimiento` y
  `LineaCargo` conservan sus precios congelados. Cambiar el precio habitual no
  altera ningún plan existente, **ni siquiera uno en `BORRADOR`**.
- **Las plantillas de plataforma siguen sin precio** (ADR-018, punto 2).
- **La cuenta por cobrar sigue naciendo solo en Caja** (ADR-007).

## Alternativas descartadas

**Mostrar el habitual al lado del campo, sin precargarlo.** Era la opción que
conservaba intacto el argumento del ADR-018: un clic más, decisión consciente.
Descartada por Carlos, con el argumento de que la velocidad es lo que hace que
una herramienta se use a diario. **Queda escrito que se descartó**: si dentro de
un año aparece que los precios acordados son siempre iguales al habitual y nadie
los está pensando, esta es la línea a revisar primero.

**Guardar el preferencial como un campo propio.** Descartada: sería un tercer
número derivado de los otros dos, que puede quedar desalineado. Los invariantes
de dinero de este proyecto se hacen cumplir, no se recalculan a mano (§13).

**Precio por odontólogo en vez de por clínica.** Descartada por ahora: es lo que
el ADR-018 ya había descartado, y sigue sin pedirlo nadie. `PreferenciaTratamiento`
existe y sería el lugar, si algún día hace falta.

## Consecuencias

**A favor:** armar un plan deja de exigir teclear el precio. La clínica puede
responder "cuánto cobré, cuánto era lo normal y cuánto di en preferenciales".
El descuento pasa a tener un contra-qué.

**En contra:** vuelve el riesgo del valor por defecto que el ADR-018 describió.
Es un riesgo aceptado con los ojos abiertos, no un olvido.

**Frágil:**

> Si alguien calcula el preferencial con el precio **actual** del catálogo en vez
> del snapshot del `PlanItem`, los números del pasado cambian solos cada vez que
> la clínica actualiza su tarifa. El snapshot existe exactamente para eso.

## Costo de revertir

**Bajo y sin pérdida.** Quitar la precarga es una línea. La columna se dejaría de
leer, no se borraría (`CLAUDE.md` §5). Los snapshots ya escritos quedan como
registro histórico de qué era habitual en cada momento, que es información válida
aunque se abandone la función.
