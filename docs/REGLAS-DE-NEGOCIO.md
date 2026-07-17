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

## 1.1 Un presupuesto NO es una deuda

**La regla:** que un tratamiento esté en un plan no significa que el paciente deba dinero. Ni aunque el plan esté **aceptado**.

**Por qué:** un plan de tratamiento es una propuesta profesional. El paciente puede aceptarlo y nunca presentarse. Puede aceptarlo y hacerse solo la mitad. Puede aceptarlo hoy y arrepentirse mañana. Si presupuestar generara deuda automáticamente, el sistema le estaría cobrando a la gente por conversaciones. El estado de cuenta de la clínica reflejaría plata que nadie debe, las cuentas por cobrar serían ficción, y cualquier decisión financiera tomada sobre esos números sería equivocada.

**Cómo se garantiza:** un plan de tratamiento y una deuda viven en tablas distintas del sistema, y no hay ningún camino automático de una a la otra.

## 1.2 Un procedimiento realizado tampoco es deuda automáticamente

**La regla:** que el odontólogo haya hecho el trabajo no crea una deuda por sí solo.

**Por qué:** puede ser una cortesía, una garantía, una corrección de un trabajo previo, parte de un paquete ya cobrado, o algo que la clínica decidió no cobrar. **Cobrar es una decisión humana, no una consecuencia mecánica de haber trabajado.** El sistema no decide a quién se le cobra.

**Cómo se garantiza:** registrar un procedimiento no crea ningún cargo. Caja muestra una lista de "procedimientos realizados que todavía no se cobraron", y una persona decide cuáles trasladar.

## 1.3 La deuda nace únicamente cuando Caja crea un Cargo

**La regla:** el **único** momento en que nace una deuda es cuando alguien con permiso de Caja crea un **Cargo**. No hay otro.

Los cinco estados del dinero, en orden:

| Estado | Qué significa | ¿El paciente debe? |
|---|---|---|
| **Presupuestado** | Está en un plan | **No** |
| **Aceptado** | El paciente dijo que sí | **No** |
| **Realizado** | El trabajo se hizo | **No** |
| **Cobrado (Cargo)** | Caja lo trasladó a la cuenta | **Sí — aquí nace la deuda** |
| **Pagado** | El paciente pagó | Se reduce o se extingue |

**Por qué:** hay un solo punto en todo el sistema donde nace una obligación de pago. Eso hace que la pregunta "¿por qué este paciente debe $200?" tenga siempre una respuesta única, con fecha, con responsable y con motivo.

**Cómo se garantiza:** existe una sola función en todo el código capaz de crear un cargo, y solo la usa el módulo de Caja.

## 1.4 Los pagos parciales son normales

**La regla:** un paciente puede abonar $50 de un cargo de $200, y quedar debiendo $150. Un solo pago puede repartirse entre varios cargos.

**Cómo se garantiza:** el sistema lleva cuánto se ha aplicado a cada cargo y **la base de datos impide** que se aplique más de lo que se debe. No es que se valide: es que no se puede.

Si un paciente paga más de lo que debe, ese excedente queda como **saldo a favor** y se puede aplicar después. El sistema ya lo contempla.

## 1.5 Un procedimiento no se puede cobrar dos veces

**Cómo se garantiza:** la base de datos lo impide. Si alguien intenta crear un segundo cargo por el mismo procedimiento, la operación es rechazada.

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

## 4.4 El catálogo NO duplica tratamientos por superficie

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

## 5.3 Una cita cancelada libera el horario

**La regla:** cancelar una cita deja el horario disponible inmediatamente.

## 5.4 El DUI se muestra enmascarado

**La regla:** en los listados generales el DUI se muestra como `********-8`. **El DUI real se conserva completo en la base de datos.**

**Quién ve el DUI completo:** administrador, odontólogo y caja, **solo** al abrir la ficha del paciente, y **cada consulta queda registrada**. Recepción nunca lo ve completo.

**Cómo se garantiza:** el enmascarado lo calcula la base de datos, y los listados **ni siquiera consultan el dato real**. No se puede filtrar lo que nunca se pidió.

## 5.5 Recepción no ve información clínica

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
- **No convierte presupuestos en deuda.**
- **No inventa lógica tributaria.**
- **No toma decisiones clínicas de ningún tipo.**

CLIDENT registra, protege y organiza. Las decisiones son de las personas.

---

# 11. Decisiones que Carlos todavía debe tomar

Ninguna bloquea el arranque. Están ordenadas por cuándo hay que responderlas.

| # | Pregunta | Cuándo | Si se decide tarde |
|---|---|---|---|
| 1 | Si un paciente **no asiste**, ¿se libera el horario para alguien más? Hoy solo lo libera la cancelación. | Agenda | Barato |
| 2 | ¿El odontólogo ve **todos** los pacientes o solo los suyos? Hoy: todos. | Pacientes | Barato |
| 3 | ¿Se van a guardar **radiografías o imágenes** en el expediente? No está contemplado. | Pacientes | Decisión nueva |
| 4 | ¿Hace falta **corte de caja** (apertura y cierre de turno)? No está contemplado. | Antes de Caja | Requiere corregir datos viejos |
| 5 | **IVA 13%: ¿los precios lo llevan incluido o se agrega aparte?** | Antes de Caja | **Caro: migrar datos financieros** |
| 6 | ¿La **ortodoncia** es un flujo real para la clínica? No encaja en el modelo de diente/superficie: es de arcada, dura meses y se cobra por cuotas. **Si es real, cambia Caja.** | Antes de Caja | Rediseño parcial de Caja |
| 7 | La ventana de **12 horas** para editar una nota clínica es arbitraria. ¿Cuál corresponde según las expectativas salvadoreñas de expediente clínico? | Procedimientos | Barato |

Las dos que más importan son la **5** y la **6**: son las únicas cuyo costo de decidirse tarde es una migración de datos financieros.
