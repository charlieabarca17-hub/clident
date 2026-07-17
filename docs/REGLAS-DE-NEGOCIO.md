# Reglas de negocio de CLIDENT

> **Este es el documento más importante del repositorio.**
>
> Está escrito en español y sin tecnicismos, para que Carlos —propietario y no programador— pueda leerlo, verificarlo y corregirlo. Es la **especificación canónica** del sistema: si una regla no está acá, no existe. Si el código hace algo distinto a lo que dice este documento, **el código está equivocado**, no el documento.
>
> Los agentes de IA que trabajen en CLIDENT deben leer este archivo antes de tocar nada. Las reglas técnicas equivalentes están en `CLAUDE.md` y `docs/ARQUITECTURA.md`.

---

## Cómo leer este documento

Cada regla tiene tres partes:

- **La regla**, en una frase.
- **Por qué**, para que se entienda qué se rompe si no se cumple.
- **Cómo se garantiza**, o sea, qué impide que alguien la viole por descuido.

Cuando dice *"la base de datos lo impide"*, significa que no es una advertencia ni una buena costumbre: es que el sistema **rechaza** la operación. Esa es la diferencia entre una regla que se cumple y una que se cumple casi siempre.

---

# 1. Reglas de dinero

## 1.1 Un presupuesto NO entra a la cuenta por cobrar

**La regla:** que un tratamiento esté en un plan no pone nada en el estado de cuenta del paciente. Ni aunque el plan esté **aceptado**.

**Por qué:** un plan de tratamiento es una propuesta profesional. El paciente puede aceptarlo y nunca presentarse. Puede aceptarlo y hacerse solo la mitad. Puede aceptarlo hoy y arrepentirse mañana. Si presupuestar cargara automáticamente la cuenta, el sistema le estaría facturando a la gente por conversaciones. El estado de cuenta reflejaría plata que nadie te ha quedado debiendo todavía, las cuentas por cobrar serían ficción, y cualquier decisión financiera tomada sobre esos números sería equivocada.

**Lo que esta regla NO dice:** no dice que un plan aceptado no tenga ningún valor jurídico. Puede tenerlo — un presupuesto aceptado por escrito es una oferta aceptada, y eso lo resuelve el derecho, no CLIDENT. Lo que dice es que **CLIDENT no lo convierte en cuenta por cobrar sin que una persona lo decida.**

**Cómo se garantiza:** un plan de tratamiento y un cargo viven en tablas distintas del sistema, y no hay ningún camino automático de una a la otra.

## 1.2 Un procedimiento realizado tampoco entra solo a la cuenta

**La regla:** que el odontólogo haya hecho el trabajo no carga la cuenta por sí solo.

**Por qué:** puede ser una cortesía, una garantía, una corrección de un trabajo previo, parte de un paquete ya cobrado, o algo que la clínica decidió no cobrar. **Cobrar es una decisión humana, no una consecuencia mecánica de haber trabajado.** El sistema no decide a quién se le cobra.

**Cómo se garantiza:** registrar un procedimiento no crea ningún cargo. Caja muestra una lista de "procedimientos realizados que todavía no se cobraron", y una persona decide cuáles trasladar.

## 1.3 La cuenta por cobrar se registra únicamente cuando Caja crea un Cargo

**La regla:** una obligación económica **entra al estado de cuenta del paciente y a las cuentas por cobrar de la clínica** en un solo momento: cuando alguien con permiso de Caja crea un **Cargo**. No hay otro.

> **Esto es una regla de CLIDENT, no una afirmación jurídica.** El sistema **no decide** cuándo nace una obligación entre la clínica y el paciente — eso lo deciden el contrato, el consentimiento firmado, la ley y, llegado el caso, un juez. Un plan de ortodoncia firmado puede obligar al paciente desde el día que lo firmó, y CLIDENT no opina sobre eso.
>
> Lo que CLIDENT afirma es más modesto y más útil: **qué reconoce como cuenta por cobrar y desde cuándo**. Confundir las dos cosas sería que un software de gestión pretenda resolver una cuestión de derecho de obligaciones.

Los cinco estados del dinero **en CLIDENT**, en orden:

| Estado | Qué significa | ¿Está en la cuenta por cobrar? |
|---|---|---|
| **Presupuestado** | Está en un plan | **No** |
| **Aceptado** | El paciente dijo que sí | **No** |
| **Realizado** | El trabajo se hizo | **No** |
| **Cobrado (Cargo)** | Caja lo trasladó a la cuenta | **Sí — aquí se registra** |
| **Pagado** | El paciente pagó | Se reduce o se extingue |

**Por qué:** hay un solo punto en todo el sistema donde una obligación entra a las cuentas. Eso hace que la pregunta "¿por qué este paciente tiene $200 en su estado de cuenta?" tenga siempre una respuesta única, con fecha, con responsable y con motivo. **Ninguna cifra aparece sola.**

**Ojo:** que un cargo **se registre** no significa que sea **exigible hoy**. Son dos cosas distintas y el sistema las separa — ver §1.8.

**Cómo se garantiza:** existe una sola función en todo el código capaz de crear un cargo, y solo la usa el módulo de Caja.

**Las tres rutas que NO existen, y que la arquitectura impide:**

- Aceptar un `PlanTratamiento` **no** crea cargos.
- Aceptar un `PlanItem` **no** crea cargos.
- Registrar un `Procedimiento` **no** crea cargos.

Ver §1.9 para el caso de las cuotas programadas, que es donde más tienta romper esta regla.

## 1.4 Los pagos parciales son normales

**La regla:** un paciente puede abonar $50 de un cargo de $200, y quedar debiendo $150. Un solo pago puede repartirse entre varios cargos.

**Cómo se garantiza:** el sistema lleva dos cuentas, no una, y **la base de datos impide** pasarse en cualquiera de las dos:

1. **Por el lado del cargo:** no se le puede aplicar a un cargo más de lo que ese cargo vale.
2. **Por el lado del pago:** no se puede repartir de un pago más plata de la que el paciente entregó.

**Por qué hacen falta las dos** (esto se corrigió en la auditoría del Ciclo 1): con solo la primera, un pago de $100 se podía repartir en cinco aplicaciones de $100 a cinco cargos distintos de $100. Cada una era válida por separado —cada cargo vale $100— y el total repartido eran **$500 de un pago de $100**. La deuda de los cinco cargos desaparecía y la clínica creía haber cobrado plata que nunca entró. Ahora la base lo rechaza.

Si un paciente paga más de lo que debe, ese excedente queda como **saldo a favor** y se puede aplicar después. Lo mismo si paga por adelantado antes de que exista cualquier cargo.

## 1.5 Anular un cargo que ya se pagó devuelve la plata al paciente

**La regla:** si se anula un cargo que el paciente ya pagó, esa plata **no se pierde ni se queda trabada**: vuelve a ser saldo a favor del paciente y se puede aplicar a otra cosa.

**Por qué:** pasa de verdad. Se cobró un procedimiento que era garantía, o se cobró dos veces por error, o se cobró el tratamiento equivocado. El paciente pagó algo que no debía. Si el sistema no puede deshacerlo, la clínica tiene plata del paciente que no le corresponde y ninguna forma de reconocérsela.

**Cómo se garantiza:** los pagos aplicados **no se borran** (son historial, como todo lo demás). En su lugar se registra una **reversa**: un movimiento nuevo que compensa al anterior. El original sigue visible, la reversa también, y queda claro qué pasó y por qué.

Además, **la base de datos obliga al orden correcto**: un cargo con dinero aplicado **no se puede anular** hasta que las reversas hayan devuelto ese dinero al paciente. No es que haya que acordarse: es que la operación falla.

**Solo se revierte el movimiento completo.** Si se aplicaron $50 y en realidad eran $30, se revierten los $50 y se aplican $30 de nuevo — de una sola vez, sin que quede un estado intermedio raro. Ves tres movimientos en vez de uno, y a cambio el sistema **impide de raíz** revertir dos veces, revertir de más, o revertir algo que nunca se aplicó. No es que se valide: no se puede.

**Lo que todavía NO existe:** devolverle el efectivo en la mano al paciente. Hoy el sistema sabe reconocerle el saldo a favor, no sacar plata de la caja. Es la decisión pendiente #9 (§11).

## 1.6 Un pago anulado deja de existir para las cuentas

**La regla:** si se anula un pago —el cheque rebotó, se digitó $500 en vez de $50, se registró al paciente equivocado— ese dinero **deja de contar como saldo a favor** inmediatamente.

**Por qué:** un pago anulado que siguiera contando sería **plata inventada**. El sistema le reconocería al paciente un saldo a favor que nunca entró a la clínica, y ese saldo se podría usar para cancelar deudas reales. La clínica daría por cobrado lo que nadie pagó, y el descuadre no aparecería en ningún lado hasta el arqueo.

**Cómo se garantiza:** el cálculo del saldo a favor excluye los pagos anulados. Y **la base de datos no deja anular un pago cuyo dinero todavía esté aplicado a algún cargo**: primero hay que revertir las aplicaciones (§1.5), y recién entonces se puede anular. Ese orden sí lo obliga la base, no la memoria de quien lo haga.

> **Lo que todavía NO está cerrado, y te lo debo decir:** hoy **nada impide deshacer una anulación**. Si alguien vuelve a poner un pago anulado como si estuviera vigente, **el crédito del cheque que rebotó revive** y se puede aplicar a deudas reales — justo lo que esta regla existe para impedir. La base no lo puede atajar sola: solo compara la fila consigo misma, no con lo que decía antes. **Es la decisión pendiente #12, y es de dinero.**

**Igual que todo lo demás: no se borra.** El pago anulado sigue visible, con su motivo y su responsable.

## 1.7 Un procedimiento no se puede cobrar dos veces

**Cómo se garantiza:** la base de datos lo impide. Si alguien intenta crear un segundo cargo por el mismo procedimiento, la operación es rechazada.

## 1.8 Cuánto debe un paciente depende de la fecha, no solo del total

**La regla:** el sistema distingue **cinco** cifras distintas, y la que manda en Caja es el **saldo exigible**. Las primeras cuatro salen de lo que Caja cargó; la quinta, de lo que el paciente pagó.

| Saldo | Qué significa |
|---|---|
| **Debe hoy** (exigible) | Lo que el paciente ya tiene que pagar. **Es "el saldo" del sistema.** |
| **En mora** (vencido) | Lo exigible desde antes de hoy que sigue sin pagarse |
| **Cuotas futuras** | Lo que ya está cargado pero todavía no le toca pagar |
| **Total cargado sin pagar** | Todo lo que Caja ya cargó y no está pagado, venza cuando venza |
| **Saldo a favor** | Plata del paciente que la clínica tiene sin aplicar (anticipos, vueltos de reversas) |

> **Ojo con el cuarto: se llama "Total cargado", no "total del contrato".** Y no es un detalle de estilo. Ese número es la suma de **lo que Caja cargó**, no de lo que el paciente firmó. Entre que la mamá acepta la ortodoncia (15/09) y que Caja crea el calendario (18/09), ese número es **$0** — y ella ya firmó por $1,080. Llamarlo "el contrato" sería que el sistema opine sobre el contrato, que es justo lo que §1.3 dice que CLIDENT no hace. **El contrato es lo que ella firmó; esto es lo que la cajera tecleó.**

**El quinto saldo mira los pagos, no los cargos.** Los otros cuatro salen todos de lo cargado; si la señora dejó $300 de prima sin aplicar, **ninguno de los cuatro lo dice** y el estado de cuenta parecería que la clínica no tiene su plata. Por eso va en la ficha, junto a "Debe hoy".

**Por qué:** una ortodoncia son 18 cuotas de $60. Cuando Caja crea el calendario (§1.9), **las 18 entran a la cuenta el mismo día** — pero **el paciente no debe $1,080 ese día: debe $60, o incluso $0 si la primera vence el mes que viene**. Si el sistema sumara todo sin mirar fechas, el estado de cuenta diría que un paciente al día está debiendo mil dólares, las cuentas por cobrar de la clínica serían ficción, y cualquier decisión tomada sobre esos números sería equivocada. Es el mismo error de §1.1 —cobrar por conversaciones— pero disfrazado de calendario.

**Cómo se garantiza:** cada cargo lleva su **fecha de vencimiento**. Los cuatro saldos de cargos salen de comparar esa fecha con hoy; no hay ningún estado guardado que alguien tenga que acordarse de cambiar, ni ningún proceso nocturno que se pueda quedar dormido.

**Reglas prácticas:**
- **El día exacto del vencimiento la cuota es exigible, pero todavía no está en mora.**
- Un paciente **puede pagar cuotas por adelantado** si quiere.
- **Repartir un anticipo entre cuotas lo decide una persona**, siempre. El sistema puede sugerir "la más atrasada primero", pero no lo hace solo.
- Si la ortodoncia se cancela a mitad: las cuotas futuras que nadie pagó se anulan con motivo; las que ya se pagaron se revierten primero (§1.5) y el dinero vuelve a ser saldo a favor del paciente.

## 1.9 Aceptar un plan y crear las cuotas son DOS acciones distintas

**La regla:** aceptar un `PlanTratamiento` **nunca** crea cargos. Cuando un tratamiento se cobra en cuotas programadas, **una persona autorizada de Caja tiene que crear expresamente el calendario financiero**, en una acción aparte.

**Son dos operaciones, de dos personas distintas, en dos momentos distintos:**

| | Acción clínica/comercial | Acción financiera |
|---|---|---|
| **Quién** | El odontólogo, con el paciente | Caja (permiso `caja:write`) |
| **Qué pasa** | El plan pasa a `ACEPTADO` | Se crean los 18 `Cargo` con sus fechas |
| **Efecto en el dinero** | **Ninguno.** El estado de cuenta no se mueve | Ahí entran a la cuenta por cobrar |
| **Queda auditado** | Sí | Sí, por separado |

**Por qué importa tanto:** este es el punto exacto donde más tienta romper la regla de §1.3. Es comodísimo que aceptar el plan genere las 18 cuotas solo — un clic menos. Pero entonces **aceptar sí crearía deuda registrada**, y §1.1 se volvería mentira para el caso más grande de la clínica. La ortodoncia sería la excepción que se come la regla.

**Y hay una razón práctica, no solo de pureza:** el odontólogo que acepta el plan **no es** quien decide los términos financieros. Puede que el paciente pida 24 cuotas en vez de 18, que pague una prima, que la primera cuota arranque el mes siguiente, o que al final pague todo de una. **Nada de eso lo sabe el odontólogo en el sillón.** Lo sabe Caja, cuando conversa la plata.

**Ejemplo:**

```
15/09  El Dr. presenta el plan de ortodoncia.        → PlanTratamiento: PRESENTADO
15/09  La mamá dice que sí, y firma.                 → PlanTratamiento: ACEPTADO
                                                        Total cargado sin pagar: $0
                                                        (aceptar no cargó nada)

18/09  Pasan a Caja. Acuerdan 18 cuotas de $60,
       la primera el 1 de octubre.
       Caja crea el calendario.                      → 18 Cargo, con sus fechas
                                                        Debe hoy:                $0
                                                          (la 1.ª vence el 1/10)
                                                        Total cargado sin pagar: $1,080
```

**Fijate en los tres días de diferencia.** Entre aceptar y cargar pasó tiempo, pasó otra conversación y pasó otra persona. **Eso no es fricción: es el control.**

**Y fijate en el 16/09**, el día del medio: el sistema muestra **$0 cargado** aunque la mamá **ya firmó por $1,080**. Eso es correcto y es exactamente lo que §1.3 explica: **CLIDENT no dice qué debe jurídicamente; dice qué está cargado.** El contrato firmado el 15 existe y obliga según el derecho — el sistema solo no había cargado nada todavía. Por eso el cuarto saldo **no se llama "total del contrato"**: si se llamara así, estaría mintiendo esos tres días.

**Cómo se garantiza:** es la misma garantía de §1.3 — existe una sola función capaz de crear un cargo y solo la usa Caja. **No hay una versión "automática" de esa función para ortodoncia.** La creación del calendario es esa misma función, llamada 18 veces por una persona que apretó un botón.

---

# 2. Precios históricos

## 2.1 Los precios de un plan no cambian nunca

**La regla:** cuando se agrega un tratamiento a un plan, se **copia** su precio. Si después la clínica cambia el precio en el catálogo, **los planes ya creados no se modifican. Ni siquiera los que están en borrador.**

**Por qué:** un plan es un compromiso con un paciente. Si en marzo le presupuestaste una corona a $300 y en junio la clínica sube el precio a $380, ese paciente presupuestó $300. Si el sistema recalculara automáticamente, el paciente vería un número distinto al que se le dijo, y la clínica no tendría forma de demostrar qué se le ofreció ni cuándo. En términos legales: destruiría la prueba de la oferta.

Lo mismo aplica hacia atrás: un reporte de ingresos del año pasado debe reflejar los precios de entonces, no los de hoy.

**Cómo se garantiza:** el plan guarda su propio precio y **ya no mira el catálogo**. No es que se evite consultarlo: es que el precio del plan está en otro lado.

## 2.2 También se congela el nombre

**La regla:** el plan guarda el nombre y el código del tratamiento tal como estaban ese día.

**Por qué:** si mañana renombrás "Resina" a "Restauración con resina compuesta", los presupuestos viejos deben seguir diciendo lo que decían cuando el paciente los firmó.

## 2.3 Desactivar un tratamiento no borra nada

**La regla:** desactivar un tratamiento del catálogo solo lo quita de la lista de opciones nuevas. **Los planes, procedimientos e historiales que ya lo usaban siguen intactos.**

---

# 3. Historial clínico

## 3.1 Los registros clínicos no se borran. Nunca.

**La regla:** en CLIDENT no existe el botón de borrar para datos clínicos. Ni para el odontograma, ni para diagnósticos, ni para procedimientos, ni para notas.

**Por qué:** el expediente clínico es un documento legal. Si un paciente reclama, si hay una demanda por mala praxis, o si la Junta de Vigilancia pide el expediente, la clínica tiene que poder mostrar **qué se supo, cuándo se supo y quién lo registró**. Un expediente que se puede editar sin dejar rastro no prueba nada — y un expediente que no prueba nada es peor que no tenerlo, porque da falsa seguridad.

**Cómo se garantiza:** sobre las tablas del historial clínico, el sistema **no tiene permiso de borrar ni de modificar** en la base de datos. Solo puede agregar. Aunque un agente de IA escribiera código para borrar historia clínica, la base de datos rechazaría la operación.

## 3.2 Las correcciones dejan trazabilidad

**La regla:** todo se puede corregir. Nada se puede desaparecer.

| Si te equivocaste en… | El sistema hace… |
|---|---|
| El odontograma | Agrega un registro nuevo de anulación. **El original sigue ahí**, marcado como anulado, con el motivo. |
| Una nota clínica | El autor la puede editar libremente por **12 horas**. Después, se guarda una **enmienda** que conserva el texto anterior, y la pantalla muestra "Nota enmendada el X por Y". |
| Un procedimiento entero | Se **anula con motivo obligatorio** y se registra de nuevo. El anulado sigue visible. |
| Un cargo o un pago | Se anula con motivo. Nunca se borra. |

**Por qué:** la diferencia entre corregir y ocultar es exactamente la diferencia entre un expediente confiable y uno adulterado. Un expediente que muestra "acá me equivoqué y así lo corregí" es **más** creíble ante un juez que uno impecable donde todo apareció perfecto a la primera.

## 3.3 El odontograma conserva toda la evolución

**La regla:** el odontograma no es una foto del estado actual. Es la **historia completa** de cada diente y cada superficie.

Ejemplo, el diente 26 superficie oclusal:

```
10/07/2026  →  Se detecta caries
15/07/2026  →  Se indica restauración
20/07/2026  →  Se realiza la restauración
```

Las tres cosas quedan. Siempre se puede preguntar "¿cómo estaba este diente en agosto del año pasado?" y el sistema responde.

**Por qué:** un odontograma que solo guarda el estado actual pierde justo lo que hace valioso un expediente: la evolución. Sin ella no se puede demostrar que la caries se detectó a tiempo, ni cuándo se indicó el tratamiento, ni cuánto esperó el paciente.

## 3.4 Datos que no se pueden cambiar después

Una vez registrado un procedimiento, estos datos son **inmutables**: la fecha en que se realizó, el precio aplicado, el tratamiento, y los dientes y superficies involucrados.

Si alguno está mal, se anula el procedimiento y se registra de nuevo. **No se edita.**

---

# 4. Separación de conceptos clínicos

## 4.1 Un diagnóstico no es un tratamiento

**La regla:** son cosas distintas y viven separadas. Un diagnóstico puede generar **ningún** tratamiento, **uno**, o **varios**.

Ejemplo real:

```
Diagnóstico:  Pulpitis irreversible en el diente 26

Tratamientos que genera:
  1. Endodoncia
  2. Reconstrucción
  3. Corona
```

**Por qué:** diagnosticar es un acto profesional distinto de tratar. Un diagnóstico puede quedar en observación, puede resolverse solo, o puede requerir tres procedimientos en cinco sesiones. Forzar una relación uno-a-uno obligaría al odontólogo a mentirle al sistema.

## 4.2 El catálogo no es lo asignado al paciente

**La regla:** el catálogo maestro (la lista de precios de la clínica) y lo que se le asigna a un paciente son cosas separadas.

## 4.3 Lo planificado no es lo realizado

**La regla:** un tratamiento en un plan es una **intención**. Un procedimiento es un **hecho ocurrido**. Estados independientes.

**Por qué:** los planes cambian. El paciente hace 3 de 5 tratamientos. El odontólogo abre el diente y encuentra otra cosa. El sistema debe poder decir "esto se planificó" y "esto realmente pasó" sin confundirlos.

## 4.4 Los estados del plan y de cada tratamiento del plan

> **Aprobados por Carlos en el Ciclo 1.** Antes no existían en ningún documento y cada archivo usaba nombres distintos.

Son **dos cosas distintas** y por eso tienen dos listas.

### El plan completo (`PlanTratamiento`) — el presupuesto como documento

| Estado | Qué significa |
|---|---|
| `BORRADOR` | El profesional lo está construyendo. **Todavía no se le presentó formalmente al paciente.** |
| `PRESENTADO` | Ya se le comunicó al paciente. Está pendiente de su decisión. |
| `ACEPTADO` | El paciente manifestó su aceptación. |
| `RECHAZADO` | El paciente lo rechazó. Se conserva como historial. |
| `ANULADO` | Dejó de estar vigente por decisión explícita y con motivo. **Nunca se borra.** |

**Aceptar el plan:**
- **no crea cargos** (§1.9);
- **no pone nada en la cuenta por cobrar**;
- **no implica** que sus tratamientos se hayan ejecutado;
- **no mueve dinero.**

### Cada tratamiento del plan (`PlanItem`)

Porque el paciente puede aceptar el plan completo y hacerse solo la mitad.

| Estado | Qué significa |
|---|---|
| `PROPUESTO` | Forma parte del plan, pero **el paciente todavía no lo aceptó individualmente**. No implica cargo. |
| `ACEPTADO` | El paciente aceptó realizar **este** tratamiento. No implica cargo. |
| `EN_PROCESO` | Ya empezó clínicamente, pero **todavía no se declaró terminado**. |
| `COMPLETADO` | **El profesional responsable determinó expresamente que concluyó.** No crea cargo por sí solo (§1.2). |
| `CANCELADO` | Se descartó o **se interrumpió** por acción explícita y con motivo. Se conserva. |
| `ANULADO` | **Nunca debió existir** (se marcó por error). Con motivo. Se conserva. Ver §4.5. |

**`CANCELADO` y `ANULADO` no son lo mismo:** `CANCELADO` dice *"existió y se paró"*; `ANULADO` dice *"esto fue un error de registro"*. Confundirlos deja afirmaciones falsas en el expediente.

**Por qué `PROPUESTO` y no `PENDIENTE`:** `PENDIENTE` ya es un estado de `Cargo`, donde significa otra cosa —deuda sin pagar—. Dos listas distintas usando la misma palabra para cosas distintas es una trampa para cualquiera que lea el sistema, humano o agente. `PROPUESTO` dice lo que es: **está propuesto, no aceptado**.

**No confundir `PROPUESTO` (ítem) con `PRESENTADO` (plan).** Se parecen, empiezan igual, y **conviven en la misma pantalla**: un plan `PRESENTADO` tiene todos sus ítems en `PROPUESTO`. **El plan se presenta; el tratamiento se propone.**

**Por qué dos listas y no una:** un plan puede estar `ACEPTADO` mientras uno de sus tratamientos está `CANCELADO` y otro `COMPLETADO`. Con una sola lista habría que mentirle al sistema.

### `PROGRAMADO` no es un estado — y es a propósito

**El estado de un `PlanItem` describe el progreso clínico del tratamiento. La programación pertenece a la Agenda.** Son dos dimensiones distintas y mezclarlas rompe las dos.

Un `PlanItem` `ACEPTADO` puede tener **cero citas, una, o varias**. Uno `EN_PROCESO` puede tener una cita futura agendada. Si `PROGRAMADO` fuera un estado, ¿qué sería una endodoncia empezada con la próxima cita ya puesta: `EN_PROCESO` o `PROGRAMADO`? **Las dos, y ese es el punto.** Un estado no puede contestar dos preguntas.

La relación `PlanItem ↔ Cita` **queda abierta como posibilidad futura** y nada en el diseño la cierra. **No se implementa ahora**: no pertenece a ninguna fase autorizada.

### `COMPLETADO` es una decisión humana, no un conteo

**Un `PlanItem` pasa a `COMPLETADO` porque un profesional autorizado lo decide.** Nunca porque el sistema contó sesiones.

Una endodoncia puede llevar 2 sesiones o 5 — depende del conducto, del paciente, de lo que se encuentre al abrir. Una regla del tipo *"si se registró la tercera sesión, entonces está completado"* sería el software decidiendo algo clínico, y este sistema **no toma decisiones clínicas** (§10).

Por eso **no existen** `totalSesiones` obligatorio, ni `sesionActual` como mecanismo de estado, ni finalización automática por conteo.

**Ojo, no confundir:** *cuánto vale cada sesión* sigue siendo una decisión pendiente (#10, §11). Eso es dinero y es otra pregunta. **Cuándo termina el tratamiento la contesta el odontólogo; cuánto se cobra por cada sesión lo contestás vos.**

## 4.5 Qué acción cambia cada estado

**Solo estas transiciones son válidas. Todo lo demás se rechaza.** Un enum que permite cualquier salto es un enum que no protege nada.

### `PlanTratamiento`

| Desde | Acción | Hacia |
|---|---|---|
| `BORRADOR` | El profesional se lo presenta al paciente | `PRESENTADO` |
| `PRESENTADO` | El paciente acepta | `ACEPTADO` |
| `PRESENTADO` | El paciente rechaza | `RECHAZADO` |
| `BORRADOR` / `PRESENTADO` / `ACEPTADO` / `RECHAZADO` | Se anula con motivo | `ANULADO` |

**`ACEPTADO` → `PRESENTADO` NO se permite, y es deliberado.** Un plan aceptado es un hecho: el paciente dijo que sí, ese día, a ese precio. Devolverlo a `PRESENTADO` para "arreglarlo" **reescribiría la historia como si la aceptación nunca hubiera ocurrido** — y esa aceptación es justamente lo que le probás a un paciente que reclama, o a un juez.

> **Principio:** un cambio material sobre un plan ya aceptado exige **un plan nuevo**, conservando el aceptado como historial. No se reescribe el viejo.

Cómo se ve en la práctica: la paciente aceptó endodoncia + corona, y a mitad de camino se decide agregar una reconstrucción. **No se toca el plan aceptado.** Se hace un plan nuevo. El viejo queda con lo que ella aceptó ese día, intacto.

**No se diseña un sistema de versionado ahora** — no hace falta para ninguna fase autorizada.

**Cómo se garantiza — y acá hay que ser honestos:** lo hace cumplir el **módulo de planes**, con la suite de pruebas `estados-plan`. **La base de datos no lo impide.** Un `CHECK` es de fila: no ve el valor anterior, así que no puede saber que un plan *venía* de `ACEPTADO`. Solo un trigger lo ataría, y este proyecto no usa triggers — el mismo límite que ya está declarado para des-anular un procedimiento.

O sea: a diferencia del dinero y del odontograma, **estas transiciones son una regla probada, no un imposible**. Es la decisión pendiente **#17**. Se dice acá porque este documento no debe prometer más de lo que el sistema hace.

**`RECHAZADO` → `ANULADO` sí se permite**, y vale explicar por qué, porque no es obvio: `RECHAZADO` afirma un hecho —*"este paciente dijo que no"*—. Si el plan se armó en el paciente equivocado, ese hecho **es falso** y quedaría en su expediente. `ANULADO` con motivo dice *"esto nunca debió existir"*, que es una cosa distinta y a veces la única cierta. Sin esta transición, un plan mal creado y rechazado deja una afirmación falsa que no se puede corregir.

`ANULADO` es terminal: no sale de ahí.

### `PlanItem`

| Desde | Acción | Hacia |
|---|---|---|
| `PROPUESTO` | El paciente acepta ese tratamiento | `ACEPTADO` |
| `ACEPTADO` | Se registra la primera sesión | `EN_PROCESO` |
| `ACEPTADO` | El profesional lo declara concluido (tratamiento de una sola sesión) | `COMPLETADO` |
| `EN_PROCESO` | Se registran más sesiones | `EN_PROCESO` (se queda) |
| `EN_PROCESO` | **El profesional lo declara concluido** | `COMPLETADO` |
| `PROPUESTO` / `ACEPTADO` / `EN_PROCESO` | Se cancela con motivo | `CANCELADO` |
| `COMPLETADO` | **Se anula con motivo** (nunca ocurrió) | `ANULADO` |

### Quién acepta los tratamientos, y qué manda sobre qué

**Aceptar el plan es UNA acción que también acepta sus tratamientos.** El usuario marca cuáles —todos, o 3 de 5— y confirma; el plan pasa a `ACEPTADO` y los ítems marcados también, **con un solo registro de auditoría que los nombra a todos**.

**Eso no contradice la no-cascada de §4.6.** Una cascada silenciosa es la que ocurre **sin que nadie la haya visto ni decidido**. Esto es una operación de **alcance explícito**, que el usuario ve antes de confirmar — la misma forma que se le exige a la creación de las 18 cuotas (§1.9).

**Y ojo: no es el caso de §1.9.** Allá son dos acciones porque son **dos personas distintas** (el odontólogo no decide los términos financieros). Acá el que acepta el plan y el que acepta cada tratamiento **son la misma persona, en el mismo sillón, en el mismo minuto**. Partirlo en 13 clics no protegería nada — y la pantalla lo "resolvería" con un botón "aceptar todos" que sí sería una cascada.

**Regla de coherencia:** **un `PlanItem` no puede salir de `PROPUESTO` si su plan no está `ACEPTADO`.** Sin esto, un tratamiento podría ejecutarse bajo un plan que **nunca se le presentó al paciente**, y el expediente afirmaría un consentimiento que no existe.

**Los ítems de un plan `RECHAZADO` no cambian de estado** — se quedan `PROPUESTO`, igual que con la anulación (§4.6). Lo que cambia es que **las listas de "tratamientos propuestos" filtran por el estado del plan**: un plan rechazado o anulado no aporta tratamientos vivos a ninguna pantalla.

**`COMPLETADO` → `CANCELADO` NO se permite.** `CANCELADO` significa *"se interrumpió"* — o sea, afirma que el tratamiento existió y se paró a medias. Aplicarlo a algo que **se terminó** sería borrar historia clínica con un cambio de estado, exactamente lo que §3.1 prohíbe.

**Si el tratamiento se hizo y estaba mal**, eso **no se arregla en el `PlanItem`**: se arregla donde está el hecho, **anulando el `Procedimiento`** con motivo (§3.2), lo que deja el anulado visible y genera su evento compensatorio en el odontograma.

**`COMPLETADO` → `ANULADO` sí se permite**, y hace falta: **un tratamiento se puede marcar completado por error y no tener ningún procedimiento detrás.** La doctora tiene la lista del plan en pantalla y marca la fila de arriba — la corona en vez de la limpieza. No hay procedimiento de corona que anular. Sin esta transición, el ítem diría *"esta corona se completó"* **para siempre, sin salida**, y el expediente afirmaría un tratamiento que nunca ocurrió.

Es el mismo argumento de `RECHAZADO` → `ANULADO`: **`CANCELADO` dice "se interrumpió"; `ANULADO` dice "esto nunca debió existir"**. Son cosas distintas, y a veces la segunda es la única cierta.

`CANCELADO` y `ANULADO` son terminales.

> **`ACEPTADO` → `COMPLETADO` directo** existe porque la mayoría de los tratamientos son de **una sola sesión**: una limpieza no necesita pasar por `EN_PROCESO` para terminar. `EN_PROCESO` es para lo que de verdad lleva varias citas.

## 4.6 Anular un plan NO cambia el estado de sus tratamientos

**La regla:** anular un `PlanTratamiento` **no modifica automáticamente** el estado de sus `PlanItem`. Ninguno.

**Ejemplo:**

```
PlanTratamiento: ACEPTADO
  ├─ Endodoncia:  COMPLETADO
  ├─ Corona:      ACEPTADO
  └─ Limpieza:    PROPUESTO

        ↓ se anula el plan, con motivo

PlanTratamiento: ANULADO
  ├─ Endodoncia:  COMPLETADO   ← sigue igual. SE HIZO.
  ├─ Corona:      ACEPTADO     ← sigue igual
  └─ Limpieza:    PROPUESTO    ← sigue igual
```

**Por qué:** la endodoncia **se hizo**. Anular el plan no la desrealiza. Si el sistema pusiera los ítems en `CANCELADO` en cascada, estaría afirmando que un tratamiento que ocurrió no ocurrió — **falsificando el expediente por un efecto secundario**.

**Qué sí hace anular el plan:** impedir acciones nuevas basadas en él. **Lo que no hace: reescribir lo que ya pasó.**

**La pantalla puede ofrecer** cancelar los tratamientos no ejecutados en el mismo flujo —es cómodo y es lo esperable—, pero **cada cancelación es una operación explícita, con su motivo y su registro de auditoría**. Nunca una cascada silenciosa.

**Regla general del sistema, no solo de acá:** ningún cambio de estado dispara otros cambios de estado en silencio. Si un agente propone una cascada "para simplificar", está proponiendo que la historia cambie sin que nadie lo haya decidido.

## 4.7 El catálogo NO duplica tratamientos por superficie

**La regla:** existe **un solo** tratamiento llamado "Restauración con resina". Las superficies se eligen al aplicarlo.

**Incorrecto** (lo que hacen muchos sistemas):
```
- Resina oclusal
- Resina mesial
- Resina distal
- Resina mesio-oclusal
- Resina ocluso-distal
- ...
```

**Correcto:**
```
Tratamiento:  Restauración con resina
Diente:       26
Superficies:  Mesial + Oclusal
```

**Por qué:** las combinaciones de superficies son decenas por tratamiento. Duplicarlas convierte un catálogo de 100 tratamientos en uno de miles, imposible de mantener, imposible de cambiar de precio y imposible de buscar.

**Cómo se garantiza:** en el catálogo **no existe el campo "superficie"**. Literalmente no hay dónde escribirlo. Las superficies solo existen al momento de asignar el tratamiento a un paciente.

---

# 5. Pacientes y sucursales

## 5.1 El paciente pertenece a la clínica, no a una sucursal

**La regla:** un paciente es de la clínica. Se puede atender en cualquier sede, y su expediente lo sigue.

**Por qué:** si el paciente fuera de una sucursal, su historia clínica quedaría fragmentada: el odontólogo de Santa Tecla no vería lo que se le hizo en Escalón. Eso es exactamente lo contrario de para qué sirve un expediente.

**Qué sí es de una sucursal:** las citas, el dinero (cargos, pagos, cortes de caja), el inventario y el lugar donde se realizó cada procedimiento. Todo eso es información de un lugar físico. El paciente no.

## 5.2 Un odontólogo no puede tener citas solapadas, aunque sean en sucursales diferentes

**La regla:** si el Dr. Martínez tiene cita de 10:00 a 11:00 en Escalón, no puede tener otra de 10:30 a 11:30 en ningún lado. **Ni en Santa Tecla, ni en la misma sede.**

**Por qué:** porque una persona no puede estar en dos lugares a la vez. La sucursal no relaja la física.

**Qué cuenta como solapamiento:**

| Cita existente | Cita nueva | ¿Conflicto? |
|---|---|---|
| 10:00–11:00 | 10:30–11:30 | **Sí** (parcial) |
| 10:00–11:00 | 10:15–10:45 | **Sí** (contenida) |
| 10:00–11:00 | 09:30–11:30 | **Sí** (la contiene) |
| 10:00–11:00 | 10:00–11:00 | **Sí** (idéntica) |
| 10:00–11:00 | **11:00–12:00** | **No** — pegadas, no solapadas |

**Cómo se garantiza:** la base de datos lo impide. Si dos recepcionistas intentan reservar el mismo horario **al mismo tiempo**, exactamente una lo logra y la otra recibe un aviso. No depende de que la pantalla haya mostrado el horario como ocupado.

**Lo mismo aplica al paciente** (agregado en la auditoría del Ciclo 1): un paciente tampoco puede tener dos citas a la misma hora con dos odontólogos distintos. Un paciente tampoco puede estar en dos sillones a la vez. La base lo impide igual.

## 5.3 Una cita cancelada libera el horario

**La regla:** cancelar una cita deja el horario disponible inmediatamente.

## 5.4 El DUI se muestra enmascarado

**La regla:** en los listados generales el DUI se muestra como `********-8`. **El DUI real se conserva completo en la base de datos.**

**Quién ve el DUI completo:** administrador, odontólogo y caja, **solo** al abrir la ficha del paciente, y **cada consulta queda registrada**. Recepción nunca lo ve completo.

**Cómo se garantiza:** el enmascarado lo calcula la base de datos, y los listados **ni siquiera consultan el dato real**. No se puede filtrar lo que nunca se pidió.

## 5.5 Un paciente menor de edad tiene un responsable

**La regla:** todo paciente menor de 18 años debe tener registrado un **responsable**: nombre, documento, teléfono y parentesco. El sistema no deja crear el expediente de un menor sin él.

**Por qué:** un niño de 7 años no tiene DUI, no firma consentimientos y no paga. La que paga es la mamá, y la que autoriza un tratamiento es la mamá. Un expediente de menor sin responsable identificado **no sirve como documento legal**: no hay a quién atribuirle el consentimiento ni a quién cobrarle.

**El documento del responsable no es necesariamente un DUI.** Puede ser pasaporte o carnet de residente — la abuela sin DUI vigente y el papá extranjero existen y son casos normales.

**Aparte y no confundir:** el **contacto de emergencia** es otra cosa. Puede ser la misma persona o no, y lo tiene cualquier paciente, sea menor o adulto.

**Lo que todavía falta:** un menor sin DUI **no tiene número con el que buscarlo**. Hoy la búsqueda es por nombre, teléfono y DUI. Es la decisión pendiente #11 (§11).

## 5.6 Recepción no ve información clínica

**La regla:** recepción gestiona pacientes, datos administrativos y agenda. **No** ve antecedentes médicos, odontograma ni notas clínicas.

---

# 6. Separación entre clínicas

## 6.1 Una clínica jamás puede ver datos de otra

**La regla:** es imposible. No difícil: imposible.

Ningún usuario de la Clínica A puede ver, modificar ni deducir la existencia de datos de la Clínica B, por ningún medio: cambiando un número en la dirección del navegador, manipulando una petición, ni por error de programación.

**Por qué:** CLIDENT es un producto que se vende a varias clínicas, y esas clínicas **compiten entre sí**. Una filtración no sería un error de software: sería exponer expedientes de salud de pacientes a un competidor, y de eso responde el operador del sistema.

**Cómo se garantiza, en tres capas independientes:**

1. **El código** filtra por clínica en cada consulta, y la clínica activa sale únicamente de la sesión — nunca de algo que el navegador pueda cambiar.
2. **La base de datos** aplica sus propias reglas de aislamiento. Aunque el código se equivoque y olvide filtrar, la base devuelve cero resultados.
3. **Las relaciones entre datos** están construidas de modo que un dato de una clínica **no puede apuntar** a un dato de otra. No es que se valide: la base de datos lo rechaza.

Y una cuarta, que no es una capa pero importa igual: **hay pruebas automáticas que intentan activamente robar datos de otra clínica**, por todas las vías. Si alguna vez lo lograran, el sistema no se puede publicar.

## 6.2 Un dato no se puede mover de clínica

**La regla:** un paciente, una cita o un cargo no se pueden trasladar de una clínica a otra. La operación es rechazada por la base de datos.

## 6.3 Una persona puede trabajar en varias clínicas

**La regla:** un odontólogo que trabaja en dos clínicas tiene **un solo usuario y una sola contraseña**, y elige con cuál entra. Puede tener roles distintos en cada una: dueño en la suya, odontólogo visitante en la otra.

**Importante:** eso **no** le permite ver datos de una clínica mientras está en la otra. Cada sesión está atada a una sola clínica.

## 6.4 El operador de CLIDENT no puede leer expedientes

**La regla:** quien administra la plataforma (crea clínicas, invita administradores, suspende cuentas) **no tiene acceso a ningún dato clínico ni financiero de ninguna clínica**.

**Cómo se garantiza:** no por una política ni por una promesa: **no tiene permiso** en la base de datos sobre esas tablas. Puede crear una clínica y sembrar su catálogo inicial, pero no puede leer un solo paciente, ni un precio, ni un cargo.

**Cuándo se construye** (decidido en el Ciclo 1, ADR-011): **cuando exista una segunda clínica.** Hoy el operador sos vos, la única clínica es la tuya, y el expediente que el operador no puede leer es el tuyo propio. Mientras tanto, crear una clínica se hace con un script que corrés vos a mano. La regla de arriba **no cambia** — es diseño aprobado; lo que se aplazó es construirla, no decidirla. El día que le vendás a la clínica #2, "el operador de CLIDENT no puede leer tu expediente, y no por promesa sino por permisos de base de datos" vuelve a ser lo primero que se construye.

---

# 7. Roles

| Rol | Qué puede hacer |
|---|---|
| **Administrador** | Configuración, usuarios, catálogos, acceso general |
| **Odontólogo** | Expediente, diagnósticos, odontograma, tratamientos, procedimientos, agenda |
| **Recepción** | Pacientes, agenda, datos administrativos. **Sin acceso clínico. DUI enmascarado.** |
| **Caja** | Cobros, pagos, historial financiero |

**Una persona puede tener varios roles en la misma clínica.** El caso típico salvadoreño es el dueño que además atiende: **administrador + odontólogo**. Eso es normal y el sistema lo contempla desde el diseño.

**Un administrador que no es odontólogo no puede escribir notas clínicas**, y no aparece en la lista de odontólogos de la agenda.

---

# 8. Inventario

- Se registran materiales con stock actual y stock mínimo.
- El sistema alerta cuando el stock está en o por debajo del mínimo.
- **El stock nunca puede quedar negativo.** La base de datos lo impide.
- Los movimientos de inventario **no se borran**: son un historial.
- Cuando no hay materiales registrados, la pantalla dice **"No hay materiales registrados"** — no una tabla vacía sin explicación.

**Todavía NO** se descuenta inventario automáticamente al realizar procedimientos. Es una decisión futura.

---

# 9. Facturación electrónica (DTE)

**Todavía no existe y no se va a inventar.**

El sistema está preparado para conectarse en el futuro con el Documento Tributario Electrónico de El Salvador: hay un punto de conexión definido y un lugar reservado en los cargos. **No hay lógica tributaria implementada, y no se debe inventar ninguna.**

Cuando llegue el momento de integrarlo con Hacienda, se conecta ahí sin tocar el resto del sistema.

---

# 10. Lo que el sistema NO hace

- **No diagnostica.** No sugiere diagnósticos ni tratamientos.
- **No decide qué cobrar.** Eso lo decide una persona en Caja.
- **No borra información.**
- **No convierte presupuestos en cuenta por cobrar.**
- **No inventa lógica tributaria.**
- **No toma decisiones clínicas de ningún tipo.**

CLIDENT registra, protege y organiza. Las decisiones son de las personas.

---

# 11. Decisiones que Carlos todavía debe tomar

Ninguna bloquea el arranque. **La lista se revisó en la auditoría del Ciclo 1**: se encontraron decisiones que nadie había registrado, y dos de las viejas quedaron resueltas.

> **Los números son los mismos que en `docs/ARQUITECTURA.md` §19.** Acá faltan algunos porque son puramente técnicos y no necesitan tu decisión. Cuando cualquier documento diga "pendiente #N", es este N.

| # | Pregunta | Cuándo | Si se decide tarde |
|---|---|---|---|
| 1 | Si un paciente **no asiste**, ¿se libera el horario para alguien más? Hoy solo lo libera la cancelación. | Agenda | Barato |
| 3 | **La forma del cobro:** IVA 13% (¿incluido o agregado?), **descuento de mostrador**, y en qué orden se aplican. Ver nota abajo. | Antes de Caja | **Caro: migrar datos financieros** |
| 4 | La ventana de **12 horas** para editar una nota clínica es arbitraria. ¿Cuál corresponde según las expectativas salvadoreñas de expediente clínico? | Procedimientos | Barato |
| 5 | ¿El odontólogo ve **todos** los pacientes o solo los suyos? Hoy: todos. | Pacientes | Barato |
| 6 | ¿Se van a guardar **radiografías o imágenes** en el expediente? **Serían el primer dato de un paciente que vive fuera de la base de datos** — ver nota abajo. | Pacientes | **Decisión grande, con su propio análisis de seguridad** |
| 7 | **¿Desde cuándo un paciente está en mora?** ¿El día después del vencimiento? ¿Hay días de gracia? La mecánica ya está (§1.8); el umbral es tuyo. | Caja | Barato |
| 2 | ¿Hace falta **corte de caja** (apertura y cierre de turno)? No está contemplado. | Antes de Caja | Requiere corregir datos viejos |
| 9 | **¿Cómo se le devuelve el efectivo a un paciente?** El sistema sabe reconocerle saldo a favor (§1.5), pero no sacar plata de la caja. | Antes de Caja | **Caro: migrar datos financieros** |
| 10 | **¿Cuánto vale cada sesión** de un tratamiento que lleva varias? Ver nota abajo. | Tratamientos | **Caro: el precio de un procedimiento no se puede editar** |
| 11 | **¿Número de expediente correlativo?** Un menor sin DUI no tiene con qué buscarse (§5.5). | Pacientes | Columna nueva |
| 12 | **¿Un pago anulado se puede des-anular?** Hoy **sí**, y eso **revive el crédito de un cheque que rebotó** (§1.6). La base no lo puede atajar sola. | Antes de Caja | **Caro: cambia cómo se anula todo** |
| 13 | **¿Un procedimiento se puede reasignar a otro plan?** Hoy no: si te olvidaste de enlazarlo, hay que anularlo y rehacerlo. ¿Esa rigidez estorba en la práctica? | Procedimientos | Barato |
| 15 | **Un cargo mal cobrado no se puede recrear.** Anularlo y volverlo a hacer —que es lo que manda el sistema para corregir un monto— **falla**. La única salida sería anular el procedimiento, o sea ensuciar el expediente clínico por un error de tipeo en Caja. | Antes de Caja | **Sin arreglo barato** |
| 18 | **La ortodoncia se puede cobrar dos veces.** Las cuotas del calendario y las activaciones mensuales son **dos caminos de cobro distintos** sobre el mismo tratamiento, y el sistema no los relaciona: cada activación va a aparecer en la lista de "realizados sin cargo" pidiendo que la cobren. Hoy lo único que lo impide es que la cajera se acuerde. | **Antes de Caja** | **Caro: cobros dobles ya hechos** |

**Resueltas en el Ciclo 1:** la **ortodoncia por cuotas** — con fechas de vencimiento, los cuatro saldos de §1.8 y la separación de §1.9, sin romper la regla de que la cuenta por cobrar se registra solo en Caja. Y los **pacientes menores de edad** — con el responsable de §5.5; solo queda el identificador (#11).

## Las que hay que entender antes de responder

### #3 — El IVA no es lo único que define cómo se ve un cobro

Un plan puede llevar descuento; **un cobro no tiene dónde guardarlo.** El descuento de mostrador —"te lo dejo en $80 de una vez"— es el caso más común de una clínica salvadoreña y hoy no tiene lugar en el sistema. Y con IVA hay que decidir además si el descuento va antes o después del impuesto, y si el impuesto se calcula sobre el total o línea por línea (dan resultados distintos por centavos, y esos centavos son los que después no cuadran en el corte de caja).

**Es una sola decisión.** Contestarla en pedazos significa pagar la migración dos o tres veces.

### #10 — Cuánto vale cada sesión

Una endodoncia de $150 puede hacerse en 3 sesiones. El sistema registra cada sesión por separado — eso está bien. **Lo que nadie definió es cuánto vale cada una.** Si cada sesión se queda con el precio del tratamiento completo, Caja va a ver tres cobros de $150 por un tratamiento de $150: **$450**. Y la regla de "no se cobra dos veces" **no lo detecta**, porque técnicamente son tres procedimientos distintos, cada uno cobrado una sola vez.

Las opciones: la primera sesión lleva el precio y las demás van en $0; o se reparte ($50 cada una); o el cobro se cuelga del tratamiento y no de la sesión.

**Por qué urge:** el precio de un procedimiento **no se puede editar nunca** (§3.4). Si nace mal, hay que anular y rehacer todo.

### #6 — Radiografías: el problema no es la tabla que falta

Toda clínica que hace endodoncia toma radiografías, y son **la prueba principal en cualquier reclamo de mala praxis**. Si CLIDENT no las guarda, la clínica las va a guardar en WhatsApp o en una carpeta del escritorio, y el expediente de CLIDENT deja de ser el expediente completo — que es justamente el argumento de §3.1.

**Posponerlo sigue siendo correcto**, pero por la razón correcta: los archivos **no viven en la base de datos**, y las tres capas de aislamiento entre clínicas (§6.1) son promesas *sobre la base de datos*. El día que se guarden imágenes, sería la primera vez que un dato de salud de un paciente vive fuera de ese perímetro, y la promesa de "imposible, no difícil" pasaría a depender de otra cosa. **Merece su propio análisis, no un rincón de otra fase.**

Y algo práctico: la clínica te lo va a pedir en el mes 2, no en el año 2.

---

**Las más caras son la 3, la 9, la 10, la 12, la 15 y la 18:** su costo de decidirse tarde es migrar datos financieros con historia que ya no cuadra — y en el caso de la **18**, además, cobros dobles que ya le hiciste a pacientes reales.

**Si solo vas a mirar una: la 18.** Es la única que puede hacerte cobrar dos veces sin que nadie se dé cuenta, en el tratamiento que más ingreso te deja.
