# Plan de trabajo — CLIDENT Clinical 2.0

> Plan largo, por ciclos, para que un agente de IA lo ejecute bajo el loop obligatorio de
> `CLAUDE.md` §16 y `docs/FLUJO-DE-DESARROLLO.md`. **Cada ciclo termina y espera aprobación
> de Carlos.** Aprobar un ciclo no autoriza el siguiente.
>
> Fecha: 2026-09-16 · **Renumerado el 2026-09-18** (Ciclo 20) · Rama de trabajo actual:
> `avanzar-plan-clident` · Último commit en `main`: `8d62572`.
>
> **Por qué se renumeró.** La versión original de este plan arrancaba en el Ciclo 17. Los
> números 13 a 19 **ya estaban ocupados** por ramas locales del 13 de septiembre que ni el
> plan ni el agente conocían, porque nadie corrió `git branch -a`. El plan arranca ahora en
> el **Ciclo 20** y todo lo demás se corrió hacia adelante. **Regla nueva y obligatoria:
> antes de proponer el nombre de una rama, correr `git branch -a` y `git worktree list`.**

---

## 0. Punto de partida (verificado contra el repo el 2026-09-16)

- Las 12 fases del roadmap inicial están implementadas y verificadas contra PostgreSQL real.
  CI verde en `main`.
- 17 ADR (001–017). **No existe ADR-018 ni `AGENTS.md`.**
- Después de la Fase 12 entraron 3 PRs de Codex (#17, #18, #19) sin ADR: paleta verde,
  catálogo sin precios (`DROP` de `precio_lista_centavos`, migración destructiva) e
  integración con Google Calendar (`googleapis`, dependencia nueva sin ADR).
- PR #20 endureció el bootstrap de roles contra bypass de RLS.
- **Hay cambios sin commit** en la rama actual (saneamiento documental, ahora Ciclo 20):
  `README.md`, `docs/ARQUITECTURA.md`, `docs/REGLAS-DE-NEGOCIO.md` y `docs/SEGURIDAD.md`.
  Lint, typecheck y 117 pruebas unitarias en verde. Pendiente de commit.
- **Cuatro commits huérfanos del 2026-09-13**, en el checkout principal
  (`~/Developer/clident`), sobre las ramas `ciclo-16-saneamiento`, `ciclo-17-agenda-paciente`,
  `ciclo-18-fechas-clinicas` y `ciclo-19-errores-clinicos`: `.gitattributes` para finales de
  línea, agenda que no deja agendar a un paciente distinto del preseleccionado, fechas
  clínicas independientes de la zona horaria del servidor, y errores de formulario visibles
  en odontograma y procedimientos. **No están en `main` ni en GitHub**, y están basados en el
  PR #19, no en el #20. Los rescata el Ciclo 21.
- **Apareció un `AGENTS.md` sin versionar** el 2026-09-17: copia byte por byte de `CLAUDE.md`
  con dos líneas cambiadas. Se sacó de la raíz en el Ciclo 20 y quedó respaldado en
  `.context/respaldos/`. Dos copias del manual se desincronizan en el primer cambio; el
  Ciclo 23 crea el archivo corto y correcto.
- **La reconciliación promete más de lo que verifica**: de los cinco controles de
  `ARQUITECTURA.md` §13.4, la suite corre cuatro y las tiene **copiadas** en vez de
  importadas de `infra/reconciliar.ts`. Lo cierra el Ciclo 22.
- `npm ci` reporta 24 avisos de dependencias (8 moderados, 13 altos, 3 críticos).
- Permisos vigentes: `agenda`, `paciente` (+`read_pii`), `clinico`, `catalogo`, `caja`,
  `inventario`, `usuarios`, `configuracion`, cada uno con `:read`/`:write`.
- Seis clases de tabla (ARQUITECTURA §4.2.1): NORMAL, APPEND_ONLY, PUENTE_EDITABLE,
  PROYECCION_DERIVADA, PARCIALMENTE_INMUTABLE y la de referencia global. La prueba
  estructural en `tests/integration/fase1a.test.ts` falla si una tabla nueva no está
  clasificada.
- Pestañas del expediente hoy: Ficha, Diagnósticos, Odontograma, Planes, Procedimientos,
  Historial.

## 1. Orden general (etapas)

Este orden sigue la recomendación de ChatGPT del 2026-09-16, ajustada a las dependencias
reales del repo y a lo que `CLAUDE.md` §15 exige decidir antes de construir:

| Etapa | Módulo | Por qué en este orden |
|---|---|---|
| A | Cierre de deuda técnica y documental | No se arranca una segunda etapa sobre docs desalineados, sin `AGENTS.md` y con 3 avisos críticos de dependencias. |
| B | **Periodoncia** | 100 % dentro de PostgreSQL, reutiliza `DienteRef`, permisos `clinico:*` y el modelo append-only. Cero decisiones nuevas de infraestructura. |
| C | Notas clínicas estructuradas | Encaja sobre `Procedimiento.notasClinicas` y `EnmiendaProcedimiento`. Sin tablas de dinero ni archivos externos. |
| D | Recall (control periódico) | Aprovecha Agenda y Procedimientos. Es lo de mayor valor comercial con menor riesgo. |
| E | Consentimiento informado (texto + versión + firma tipeada) | Depende de tener planes y notas maduras. La firma manuscrita/imagen queda para F. |
| F | **Imágenes y archivos** | **Primer dato del paciente fuera de PostgreSQL.** Exige ADR propio, dependencia nueva (almacenamiento de objetos) y decisión de Carlos. Bloquea la firma manuscrita de E y las fotos de Ortodoncia. |
| G | Laboratorio dental | Flujo enviado/recibido/colocado, ligado a `PlanItem`. |
| H | Portal del paciente, WhatsApp, Ortodoncia/Implantes, IA asistiva | Fuera de este plan. Requieren decisiones de producto y de costos que Carlos no ha tomado. **No se diseñan ni se adelantan.** |

**Regla de la etapa F:** ningún ciclo anterior a F puede crear columnas para archivos
("`storageKey`", "`urlFirma`", etc.). Si un ciclo lo necesita, se detiene y se reporta.

## 2. Ciclos detallados

Numeración: **arranca en el Ciclo 20**, porque los números hasta el 19 ya están ocupados por
ramas locales (ver la nota de la cabecera). Cada ciclo lleva rama `ciclo-N-descripcion-corta`
salida de `main` actualizado (o de la rama aprobada anterior si depende de ella). **Antes de
nombrar cualquier rama: `git branch -a` y `git worktree list`.**

### Etapa A — Cierre de deuda

**Ciclo 20 — Saneamiento documental (en curso).** Mostrar el diff pendiente de `README.md`,
`ARQUITECTURA.md`, `REGLAS-DE-NEGOCIO.md` y `SEGURIDAD.md`; pedir a Carlos que autorice
commit y PR. Incluye las dos correcciones de la auditoría: que §13.4 no declare cinco
controles verificados cuando la suite corre cuatro, y que `SEGURIDAD.md` §5.4 deje de
contradecir a `ARQUITECTURA.md` §12.4 sobre la FK contra la columna generada. Saca de la raíz
el `AGENTS.md` duplicado. Sin commit hasta que Carlos lo pida. Criterio: PR abierto contra
`main`, CI verde.

**Ciclo 21 — Rescatar los cuatro commits del 13 de septiembre.** Rebasar
`ciclo-19-errores-clinicos` sobre `main` (hoy está sobre el PR #19, no sobre el #20), resolver
los conflictos que deje el PR #20, correr lint, typecheck, unitarias e integración, y abrir su
PR. **`.gitattributes` va primero**: si entra después de otro trabajo, la renormalización de
finales de línea produce un diff gigante que esconde los cambios reales. Si algún commit ya no
aplica, se reporta y **no se reescribe**. Criterio: los cuatro commits en `main`, CI verde, y
las ramas `ciclo-16` a `ciclo-19` sin trabajo pendiente.

**Ciclo 22 — Que la reconciliación verifique lo que promete.** Las pruebas de integración
**importan** `CONSULTAS_RECONCILIACION` de `infra/reconciliar.ts` en vez de tener las
consultas copiadas, y el control #5 (resurrecciones contra la auditoría) entra a la suite.
Es el único ciclo de código de la etapa A. Criterio: las cinco consultas corren en CI, y
cambiar el texto de una consulta en `infra/reconciliar.ts` cambia lo que la prueba verifica.
Después, actualizar §13.4 quitando los dos huecos declarados.

**Ciclo 23 — `AGENTS.md`.** Crear `AGENTS.md` en la raíz **corto, que apunte a `CLAUDE.md`**
como manual obligatorio y resuma las 10 reglas que Codex violó: rama por ciclo, un ciclo = un
objetivo, sin `db push`, sin migraciones destructivas, sin dependencias sin ADR, sin commit ni
push sin autorización, `findFirst` con `clinicaId`, precios congelados, tablas clasificadas,
`set_config` solo en `tenant.ts`. **Prohibido duplicar el texto de `CLAUDE.md`**: dos copias
se desincronizan en el primer cambio y un agente termina leyendo la vieja. Solo documentación.

**Ciclo 24 — ADR-018: catálogo sin precios de lista.** Documentar *a posteriori* la
decisión del PR #19 (quitar `precio_lista_centavos`): contexto, qué se descartó,
consecuencias y el hecho de que fue una migración destructiva ejecutada sin ADR (se documenta,
no se borra). Corregir `CLAUDE.md` §7 y ADR-006 con una nota de "superseded parcialmente
por ADR-018" **sin editar el texto histórico del ADR-006**. Marcar ADR-006 en el índice.

**Ciclo 25 — ADR-019: integración con Google Calendar.** Documentar la dependencia
`googleapis`, el cifrado AES-256-GCM del token, qué se manda a Google ("Cita CLIDENT" sin
datos clínicos) y qué se descartó. Solo documentación.

**Ciclo 26 — Auditoría de dependencias.** Correr `npm audit` y clasificar los 24 avisos:
cuáles se resuelven con `npm audit fix` sin cambios mayores, cuáles exigen actualización
mayor (requieren aprobación aparte, `CLAUDE.md` §15) y cuáles son solo de desarrollo.
**Este ciclo solo reporta y propone**; no actualiza nada hasta que Carlos apruebe la lista.

**Ciclo 27 — Aplicar las actualizaciones aprobadas en el Ciclo 26.** Una por una si son
mayores. Lint, typecheck, unitarias e integración en verde.

### Etapa B — Periodoncia

**Ciclo 28 — Diseño formal de Periodoncia (ADR-020 en estado Propuesto + secciones nuevas
en ARQUITECTURA y REGLAS-DE-NEGOCIO). Sin código, sin migración.** Es una decisión
estructural (§5 del flujo): se aprueba antes de escribir la primera línea. El diseño debe
fijar, como mínimo:

- **Modelo.** `EvaluacionPeriodontal` (cabecera: paciente, expediente, odontólogo, sucursal,
  `evaluadaEn`, motivo/tipo, `creadoPorId`) y `MedicionPeriodontal` (detalle por diente y
  sitio: `fdi`, `sitio` enum de 6 posiciones —DV, V, MV, DL, L, ML—, `profundidadSondajeMm`,
  `margenGingivalMm` con signo para recesión, `sangrado`, `placa`, `supuracion`). Movilidad
  (0–3) y furcación (grados I–III, solo en piezas multirradiculares) van **por diente**, en
  una tabla aparte o como filas con `sitio = NULL`; el ADR elige y justifica.
- **Inmutabilidad.** Una evaluación es un hecho clínico. `evaluaciones_periodontales` es
  PARCIALMENTE_INMUTABLE (mutable solo `estado`, anulación con motivo y `actualizado_en`);
  `mediciones_periodontales` es APPEND_ONLY. La corrección es **anular y volver a crear**,
  igual que `Procedimiento`. No hay `UPDATE` de mediciones ni `DELETE`.
- **Comparación.** Se compara en lectura entre dos evaluaciones del mismo paciente; no se
  materializa nada.
- **Indicadores calculados, nunca diagnóstico.** Porcentaje de sitios con sangrado, con
  placa, con profundidad ≥ 4 mm y ≥ 6 mm, nivel de inserción clínica (profundidad +
  recesión). El sistema **no** asigna estadio ni grado periodontal: eso lo decide el
  odontólogo y se registra, si acaso, como `Diagnostico` (Fase 5). Esta línea va textual en
  REGLAS-DE-NEGOCIO.
- **Permisos.** Lectura `clinico:read`, escritura `clinico:write`. Administrador sin rol
  clínico **no ve** el periodontograma (ADR-003).
- **Multi-tenant.** `clinicaId NOT NULL`, `@@unique([clinicaId, id])`, FK compuestas con
  `onUpdate: Restrict`, RLS + GRANT en la migración, ambas tablas registradas en el
  registro canónico de clases.
- **Constraints en la base, no en código:** `CHECK` de rangos (profundidad 0–15 mm,
  margen −15..15, movilidad 0–3, furcación 0–3), `CHECK` de `fdi` válido vía FK a
  `DienteRef`, unicidad `(evaluacionId, fdi, sitio)`.
- **Alternativas descartadas** que el ADR debe dejar por escrito: mediciones como JSON en la
  cabecera (no consultable, no constreñible), sobrescribir la última evaluación (destruye
  historia), reutilizar `EventoOdontograma` (mezcla condición dental con medición
  periodontal, y el reducer no lo entiende).

**Ciclo 29 — Migración y esquema de Periodoncia.** `schema.prisma` + `prisma migrate dev
--create-only` + SQL a mano (RLS, FORCE, políticas, GRANT por clase, CHECK, unicidad).
Registrar ambas tablas en el registro canónico de `fase1a.test.ts`. Criterio: prueba
estructural de privilegios y de RLS en verde; un `UPDATE` sobre `mediciones_periodontales`
con `clident_app` → *permission denied*.

**Ciclo 30 — Repositorio, DTO y validación Zod.** `src/server/db/periodoncia.ts` (crear
evaluación con sus mediciones en una sola transacción, listar por paciente, leer una, anular
con motivo), `src/server/dto/periodoncia.ts`, esquema Zod **sin `clinicaId`**, pruebas
unitarias de validación y prueba de integración `fase13-periodoncia.test.ts`: aislamiento
entre clínicas devuelve `NOT_FOUND`, rangos fuera de `CHECK` rechazados, anulación preserva
la evaluación original.

**Ciclo 31 — Cálculo de indicadores.** `src/lib/periodoncia.ts` puro (sin Prisma), con
pruebas unitarias de casos borde (sin mediciones, sitio faltante, recesión negativa).
Sin UI.

**Ciclo 32 — Server actions y pestaña "Periodoncia" en el expediente.** Vista de lectura:
lista de evaluaciones, detalle con la grilla 6 sitios × 32 piezas (reutilizar
`src/components/odontograma/arcada.tsx` como referencia visual, no copiarlo), indicadores.
Respeta la paleta vigente (verde pino/crema).

**Ciclo 33 — Formulario de captura.** Captura rápida por diente con teclado (6 valores
seguidos), sangrado/placa/supuración como toggles, movilidad y furcación por pieza. Una sola
transacción al guardar. Prueba de que un administrador sin rol clínico no puede entrar.

**Ciclo 34 — Comparación entre evaluaciones.** Selector de dos evaluaciones y vista de
diferencias por sitio (mejoró / empeoró / igual). Solo lectura.

**Ciclo 35 — Periodoncia en el Historial unificado.** Cada evaluación aparece en la línea de
tiempo de Fase 11. Marcar ADR-020 como Aceptado.

### Etapa C — Notas clínicas estructuradas

**Ciclo 36 — Diseño (ADR-021 Propuesto).** `PlantillaNotaClinica` por clínica (copiada de
plantillas de plataforma, igual que el catálogo), con campos tipados (texto, opción,
número, sí/no). La nota final **se guarda como texto plano en
`Procedimiento.notasClinicas`** más un JSON con las respuestas para reconstruir el
formulario. La regla de 12 h y `EnmiendaProcedimiento` **no cambian**. Sin dictado por voz:
eso es IA y va a la etapa H.

**Ciclo 37 — Migración + repositorio de plantillas.** Tablas NORMAL con RLS y GRANT.

**Ciclo 38 — Semilla de plantillas de plataforma** para extracción, endodoncia,
profilaxis, resina, corona. Texto clínico revisado por Carlos con un odontólogo antes de
mergear. **Si no hay odontólogo disponible, este ciclo se mueve después de Recall** en vez
de bloquear la etapa.

**Ciclo 39 — UI: seleccionar plantilla al registrar procedimiento** y generar la nota.

### Etapa D — Recall

**Ciclo 40 — Diseño (ADR-022 Propuesto).** `Recall` por paciente: `tipo`, `intervaloMeses`,
`fechaObjetivo`, `origenProcedimientoId` opcional, `citaId` opcional cuando ya se programó.
Estados derivados en lectura (programado / pendiente / vencido) **a partir de fechas**, no
almacenados. `Tratamiento` del catálogo gana `intervaloRecallMeses` opcional (aditivo,
sugerencia, nunca obligación). Registrar un procedimiento **propone** el recall; una persona
lo confirma.

**Ciclo 41 — Migración + repositorio. Ciclo 42 — UI: recalls del paciente y lista
"quién debería volver este mes" en el Dashboard.**

### Etapa E — Consentimiento informado

**Ciclo 43 — Diseño (ADR-023 Propuesto).** `PlantillaConsentimiento` versionada por clínica
(cada versión inmutable; cambiar el texto crea versión nueva) y `Consentimiento` firmado
ligado a `PlanTratamiento` o `PlanItem`: snapshot del texto, riesgos aceptados, nombre de
quien firma, relación con el paciente, fecha, usuario que lo registró. **Firma en esta etapa
= aceptación registrada con nombre completo y hora, sin imagen.** La firma manuscrita o
digital queda explícitamente para después de la etapa F. Tabla APPEND_ONLY.

**Ciclo 44 — Migración + repositorio. Ciclo 45 — UI en el plan: "Registrar consentimiento" e
impresión.** El sistema **no** bloquea realizar un procedimiento sin consentimiento
registrado; solo lo muestra como advertencia. Bloquearlo es decisión clínica de Carlos.

### Etapa F — Imágenes y archivos (requiere decisión de Carlos antes de empezar)

**Ciclo 46 — ADR-024 Propuesto: almacenamiento de archivos clínicos.** Comparar proveedores
compatibles con Neon/Vercel (Vercel Blob, Cloudflare R2, AWS S3), costos, región, cifrado en
reposo, URLs firmadas con vencimiento corto, cómo se aisla por clínica (prefijo por
`clinicaId` **y** verificación de pertenencia en el repositorio antes de firmar cualquier
URL), respaldo, y qué pasa al anular una imagen (nunca se borra el binario; se marca
anulada). Metadatos en PostgreSQL (`ImagenClinica`: tipo, fecha de captura, pieza opcional,
descripción, `storageKey`, `hash`, autor). Tabla PARCIALMENTE_INMUTABLE. **Ninguna línea de
código hasta que Carlos elija proveedor y apruebe el costo.**

**Ciclos 47–50 — Implementación** solo tras aprobación: dependencia (con ADR), migración,
repositorio y carga/visor en la pestaña "Imágenes".

### Etapa G — Laboratorio dental

**Ciclo 51 — Diseño (ADR-025 Propuesto)** y ciclos 52–54 de implementación. `CasoLaboratorio`
ligado a `PlanItem`, estados enviado → recibido → colocado (+ rehecho), laboratorio externo
como entidad de la clínica. Sin costos ni cargos: el costo de laboratorio **no** entra a
Caja en este plan.

## 3. Lo que este plan NO autoriza

- Nada de la etapa H.
- Ninguna dependencia nueva sin su ADR y sin aprobación de Carlos.
- Ninguna migración destructiva. Ningún `db push`.
- Ningún cambio al modelo financiero ni a dónde se registra la cuenta por cobrar.
- Ningún cálculo que el software presente como diagnóstico.
- Ningún commit ni push sin que Carlos lo pida en ese ciclo.
