# ADR-005 — Odontograma basado en eventos append-only

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 0

## Contexto

El odontograma es uno de los núcleos clínicos: 32 dientes permanentes, 20 temporales, con condiciones por diente y por superficie.

El requisito del propietario, textual: *"El odontograma NO debe ser solamente una representación del estado actual. Los cambios clínicos deben conservar historial. Una actualización no debe destruir silenciosamente información anterior."*

Con el ejemplo:

```
10/07/2026  Caries detectada en diente 26, superficie oclusal.
15/07/2026  Tratamiento indicado.
20/07/2026  Restauración realizada.
```

## Decisión

**Log append-only de eventos clínicos como fuente de verdad, más una tabla de proyección con el estado actual, mantenida en la misma transacción.**

No es event sourcing puro: sin agregados, sin replay en lectura, sin bus de eventos. Tampoco es estado mutable + tabla de historial.

```
EventoOdontograma  (append-only)   fdi, superficie, tipo, condicion?, ocurridoEn (clínica),
                                   creadoEn (captura, inmutable), registradoPorId,
                                   diagnosticoId?, planItemId?, procedimientoId?,
                                   anulaEventoId?, motivoAnulacion?

EstadoSuperficie   (proyección)    @@unique([clinicaId, pacienteId, fdi, superficie])
                                   condicion, tratamientoPendiente, ultimoEventoId, ultimoEventoEn
```

**Tipos de evento:** `CONDICION_REGISTRADA`, `TRATAMIENTO_INDICADO`, `PROCEDIMIENTO_REALIZADO`, `CONDICION_ANULADA`.

### Por qué

1. **El camino destructivo debe ser estructuralmente inexistente.** "Una actualización no debe destruir información anterior" **no se cumple con disciplina** en un código mantenido por agentes de IA. Con una tabla mutable, un `prisma.condicionDental.update()` de aspecto perfectamente razonable, escrito dentro de seis meses, borra historia clínica **y se ve correcto en la revisión**. Con append-only **no existe el verbo `update`**: el único verbo es `create`. La corrección se vuelve visible en el diff.
2. **El propietario pidió literalmente una línea de tiempo.** Eso *es* el log renderizado directamente. Estado + tabla de auditoría exigiría reconstruir la narrativa desde blobs JSON de `antes`/`después` — justo el código que los agentes hacen sutilmente mal.
3. **Es un registro legal.** El expediente clínico es documento legal. Append-only + quién/cuándo/por qué es la postura defendible ante un reclamo o la Junta de Vigilancia.
4. **La proyección lo mantiene aburrido.** Sin ella, cada render del odontograma y cada consulta transversal ("pacientes con caries pendiente") tendría que plegar eventos. Con ella, el estado actual es un `SELECT` indexado normal.

### Refuerzo por privilegios

`clident_app` tiene **solo `SELECT` e `INSERT`** sobre `eventos_odontograma`. Sin `UPDATE`, sin `DELETE`. **Aunque un agente escribiera código para borrar historia clínica, PostgreSQL rechaza la operación.**

### `DienteRef` y `SuperficieDiente`

**Tabla global `dientes_ref`** (52 filas FDI), sin `clinicaId`, semilla fija, no editable por las clínicas. **Sin la tabla no hay FK**, y sin FK un `fdi` inválido (19, 29, 56) solo lo atrapa la validación de aplicación.

**"No editable" se implementa como privilegio:** `clident_app` recibe **solo `SELECT`**. Una clínica no puede alterar la dentición humana porque la base se lo niega.

**Una sola fuente de los datos:** `src/lib/dientes.ts` (52 entradas tipadas, usadas por la UI para el SVG y la aritmética de cuadrantes) → `prisma/seed/dientes.ts` **deriva** la tabla → una prueba afirma que coinciden. La tabla es la **proyección en la base y existe para que haya FK**.

**`superficies_diente`** (global, ~250 filas, PK `[fdi, superficie]`, `COMPLETO` para los 52 dientes). FK `[fdi, superficie]` desde las cinco tablas clínicas. Hace **imposible** registrar "caries oclusal en el incisivo 11" y elimina la lógica de `esAnterior` dispersa en el código.

## Alternativas descartadas

**Estado mutable + tabla de historial (`ToothCondition` + `ToothConditionHistory`).** La opción convencional, y por eso la más tentadora. Descartada: el verbo `update` existe, y basta un `update` mal escrito para destruir historia clínica sin dejar rastro. Un trigger que copie a historial ayudaría, pero es lógica invisible desde el código que el agente edita.

**Event sourcing puro** (sin proyección, plegando eventos en cada lectura). Descartada por sobreingeniería: cada render del odontograma y cada consulta transversal pagaría el fold. La proyección es 100 líneas y hace que los agentes escriban lecturas normales de Prisma.

**Superficie nulable para condiciones del diente entero.** Descartada por un detalle que muerde: **en PostgreSQL los `NULL` no colisionan en un índice único**, así que `@@unique([clinicaId, pacienteId, fdi, superficie])` permitiría silenciosamente estados duplicados del diente entero. Se usa el centinela `Superficie.COMPLETO`.

**Un evento por diente con varias superficies** (arreglo de superficies). Descartada: complica el fold y el timeline. Un evento = un diente + **una** superficie; registrar caries en 26 mesial+oclusal escribe 2 eventos con el mismo `diagnosticoId`. **La UI agrupa; el modelo se mantiene plano.**

**FDI como constantes en código, sin tabla.** Ésta fue una **contradicción real del plan** (decía "constantes, no tablas" en una sección y modelaba la tabla en otra), corregida en el Ciclo 0. Sin tabla no hay FK. Y no es "o una o la otra": el archivo TS es la fuente de los datos, la tabla es su proyección para integridad referencial.

## Consecuencias

**A favor:**
- Ningún flujo puede destruir historia clínica: la base lo rechaza.
- El timeline que pidió el propietario es una consulta directa.
- Correcciones con `CONDICION_ANULADA`: el original sigue existiendo, con motivo y autor.
- Un `fdi` o una superficie inválidos son violación de FK, no un bug silencioso.

**En contra:**
- La proyección puede desincronizarse. **Acotado:** es derivada, nunca autoritativa; ambas escrituras van en una `$transaction`; `npm run odontograma:rebuild` la regenera; y una prueba verifica que `rebuild()` es **idempotente**. Esa prueba es lo que hace segura la proyección.
- Más filas que un modelo mutable. Irrelevante a escala de clínica dental.

**Frágil:**
- Un agente que agregue un tipo de evento y olvide la rama del reducer. **Mitigación:** el `switch` **no tiene `default`** — TypeScript convierte un enum nuevo sin rama en **error de compilación**.
- **Carrera detectada en el Ciclo 0:** dos eventos concurrentes sobre la misma superficie hacían que ganara el último en commitear, aunque su `ocurridoEn` fuera **anterior**. Un evento retroactivo podía pisar uno más nuevo. Corregido: la actualización de la proyección es condicional (`AND ultimo_evento_en <= $nuevo`).

## Costo de revertir

**Muy alto, y sería una pérdida de datos.** Pasar a un modelo mutable significaría colapsar la historia a un estado actual: exactamente lo que este ADR existe para impedir.

Si un agente futuro propone "simplificar el odontograma a una tabla mutable", **este documento es la respuesta.**
