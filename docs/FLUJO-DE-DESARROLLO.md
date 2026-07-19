# Flujo de desarrollo de CLIDENT

> Cómo se trabaja en este proyecto. Obligatorio para cualquier agente de IA y para cualquier persona.
>
> Las reglas técnicas están en `CLAUDE.md`. La arquitectura, en `docs/ARQUITECTURA.md`. Las reglas de negocio, en `docs/REGLAS-DE-NEGOCIO.md`.

## Por qué existe este documento

El propietario no es programador y no puede revisar código línea por línea. Su control sobre el sistema no viene de leer diffs: viene de que **el trabajo llegue en pedazos chicos, explicados en español, uno a la vez, y que nada avance sin que él lo apruebe.**

Un agente de IA que "aprovecha el impulso" y hace cinco cosas de una produce un cambio que el propietario no puede evaluar. Ahí es donde se pierde el control del proyecto — no de golpe, sino un ciclo cómodo a la vez.

**De eso protege este documento.**

---

# 1. Reglas absolutas

1. **Nunca se implementan automáticamente ciclos siguientes.** Aprobar un ciclo autoriza **ese** ciclo. Nada más.
2. **Nunca se hace push en silencio.** El push requiere autorización explícita, cada vez.
3. **Nunca se hace `push --force`.** Ni `reset --hard` sobre trabajo publicado. Ni reescritura de historia publicada. Ni `--no-verify`.
4. **Nunca se hace commit sin que Carlos lo pida.**
5. **Una decisión estructural importante requiere revisión ANTES de ejecutarse**, no después (§5).
6. **Un ciclo = un objetivo.** Si son dos objetivos, son dos ciclos.
7. **Todo ciclo termina deteniéndose** y esperando aprobación.

---

# 2. El loop de desarrollo

```
LEER
  → DEFINIR UN ÚNICO OBJETIVO
    → IDENTIFICAR IMPACTO
      → IMPLEMENTAR SOLO ESE OBJETIVO
        → EJECUTAR VALIDACIONES
          → AUTOAUDITAR
            → MOSTRAR DIFF
              → REPORTAR
                → DETENERSE
```

| Paso | Qué significa |
|---|---|
| **LEER** | `CLAUDE.md`, `docs/ARQUITECTURA.md`, `docs/REGLAS-DE-NEGOCIO.md`, los ADR relevantes y el código que vas a tocar. **Antes** de escribir nada. |
| **DEFINIR UN ÚNICO OBJETIVO** | Una frase. Si necesita un "y", probablemente son dos ciclos. |
| **IDENTIFICAR IMPACTO** | Qué archivos, qué migraciones, qué riesgos, qué se puede romper, qué pruebas hacen falta. |
| **IMPLEMENTAR SOLO ESE OBJETIVO** | Nada "de paso". Nada de fases futuras. Si encontrás otro problema, **anotalo y seguí** — no lo arreglés. |
| **EJECUTAR VALIDACIONES** | `npm run lint && npm run typecheck && npm test`. Sin excepciones. |
| **AUTOAUDITAR** | Releer tu propio diff contra `CLAUDE.md`, regla por regla (§4). |
| **MOSTRAR DIFF** | `git diff` completo y visible. No un resumen. |
| **REPORTAR** | La plantilla de §3, en español. |
| **DETENERSE** | Y esperar aprobación explícita. |

---

# 3. Plantilla de reporte de ciclo

Todo ciclo se reporta con esta estructura, en español:

```markdown
## CICLO N — <título>

### OBJETIVO
Una frase. Qué se buscaba lograr.

### ALCANCE
Qué entra y — explícitamente — qué NO entra en este ciclo.

### ARCHIVOS AFECTADOS
Lista completa: creados, modificados, eliminados.

### RIESGOS
Qué se puede romper. Qué quedó frágil. Qué se asumió sin verificar.

### IMPLEMENTACIÓN
Qué se hizo y por qué se hizo así. Decisiones tomadas y alternativas descartadas.

### PRUEBAS
Qué se probó, con qué comando, y el resultado real (no el esperado).
Si algo falla, se dice que falla y se pega la salida.

### AUTOAUDITORÍA
Revisión del propio diff contra CLAUDE.md, regla por regla. Ver §4.

### GIT DIFF
El diff completo.

### RESULTADO
Qué quedó funcionando. Qué quedó pendiente. Qué necesita decisión de Carlos.

### SIGUIENTE CICLO PROPUESTO
Qué correspondería después — como **propuesta**, no como plan a ejecutar.
```

## Reglas del reporte

- **En español**, y la sección de resultado entendible para alguien que no programa.
- **Si algo falló, se dice.** Un reporte que oculta una prueba en rojo es peor que no reportar: destruye la única forma que tiene el propietario de confiar en lo que lee.
- **Si algo se asumió, se dice.** "Asumí que X" es información valiosa.
- **La autoauditoría no es un trámite.** Si no encontró nada, hay que explicar qué se revisó.

---

# 4. Autoauditoría: la lista

Antes de reportar, releé tu diff y respondé cada una:

**Multi-tenant**
- [ ] ¿Hay algún `findUnique(` sin `clinicaId` en el mismo `where`?
- [ ] ¿Alguna función de repositorio sin `ctx: TenantContext` como primer parámetro?
- [ ] ¿Algún `clinicaId` que venga de un parámetro, URL o body en vez de la sesión?
- [ ] ¿Algún esquema Zod de entrada que incluya `clinicaId`?
- [ ] ¿Tabla nueva sin `clinicaId`, sin `@@unique([clinicaId, id])`, sin RLS o sin política?
- [ ] ¿Relación nueva entre tablas de inquilino sin FK compuesta?

**Prisma y migraciones**
- [ ] ¿Se importó `@prisma/client` fuera de `src/server/db/**`?
- [ ] ¿Aparece `db push` en algún lado?
- [ ] ¿Se usó `$queryRaw` fuera de `src/server/db/raw/`? ¿Alguna variante `Unsafe`?
- [ ] ¿Se tocó `set_config` fuera de `src/server/db/tenant.ts`?
- [ ] ¿La migración necesitaba SQL a mano y se escribió?

**Dinero**
- [ ] ¿Todo monto es `Int` en centavos y termina en `Centavos`?
- [ ] ¿Hay algún join a `Tratamiento` para obtener un precio de algo ya creado? **(bug)**
- [ ] ¿El precio del catálogo se impone al paciente en vez de ser solo una referencia? **(bug: el odontólogo fija el precio del `PlanItem`)**
- [ ] ¿Un tratamiento multisesión puede generar un cargo por sesión? **(bug: se cobra una vez por `PlanItem`)**
- [ ] ¿La suma de cuotas difiere del total acordado? **(bug)**
- [ ] ¿Algo crea un `Cargo` fuera del módulo de Caja? **(bug)**
- [ ] ¿Aceptar un `PlanTratamiento` o un `PlanItem` crea cargos? **(bug: la aceptación y el calendario son dos acciones)**
- [ ] ¿Se escribió una variante automática de `crearCargo()` "para cuotas"? **(bug: es la excepción que se come la regla)**
- [ ] ¿Algún cambio de estado dispara otros en cascada silenciosa? **(bug: anular un plan NO toca sus ítems)**
- [ ] ¿Se usó `PENDIENTE` como estado de `PlanItem`? **(es `PROPUESTO`; `PENDIENTE` es de `Cargo`)**
- [ ] ¿Aparece `PROGRAMADO` como estado de `PlanItem`? **(la programación vive en Agenda)**
- [ ] ¿Algo mueve un `PlanItem` a `COMPLETADO` por conteo de sesiones? **(lo decide un profesional)**
- [ ] ¿Se hizo `SELECT` y después `INSERT` para validar un invariante? **(carrera)**
- [ ] ¿Se toman varios locks sin orden determinista? **(deadlock)**
- [ ] ¿Una `AplicacionPago` mueve **los dos** contadores (`cargos` y `pagos`)? **(sobreaplicación)**
- [ ] ¿Se agregó un contador materializado sin su consulta de reconciliación? **(deriva silenciosa)**
- [ ] ¿Algún `Σ(monto − aplicado)` **sin** `fechaExigibleEn <= hoy`? **(bug: dice que se debe hoy todo el contrato futuro)**
- [ ] ¿Algún saldo o fórmula de crédito a favor **sin** excluir los anulados? **(bug: inventa plata / revive deuda)**
- [ ] ¿Alguna consulta de reconciliación corriendo con `clident_app`? **(RLS la deja en cero y "cuadra" siempre)**
- [ ] ¿Se escribió `REVOKE UPDATE (columna)` sobre un rol con `UPDATE` de tabla? **(no hace nada — ADR-012)**
- [ ] ¿Se concedió `UPDATE` por columna **antes** de revocar el de tabla? **(el grant se pierde)**
- [ ] ¿Tabla nueva sin su clase de privilegio declarada? **(ADR-012)**
- [ ] ¿Se le devolvió `DELETE` o `TRUNCATE` a `clident_app` "para que pasen las pruebas"? **(desarma el append-only)**

**Historial clínico**
- [ ] ¿Hay algún `delete` de datos clínicos o financieros?
- [ ] ¿Se sobrescribe algo que debería anularse con motivo?
- [ ] ¿Se "normalizó" algún campo snapshot? **(bug)**
- [ ] ¿Se proyecta `CONDICION_ANULADA` con un `UPDATE` incremental en vez de recalcular? **(bug clínico silencioso)**
- [ ] ¿El desempate de la proyección usa la tupla `(ocurridoEn, creadoEn)` completa, igual que el reducer?

**Alcance**
- [ ] ¿Se implementó algo de una fase futura?
- [ ] ¿Se agregó una dependencia sin ADR y sin autorización?
- [ ] ¿Se tomó alguna decisión estructural sin revisión previa? **(§5)**

---

# 5. Decisiones estructurales: revisión ANTES de ejecutar

Estas cosas **no se implementan y después se muestran**. Se proponen, se discuten y se aprueban **antes** de escribir la primera línea:

- Cambios al modelo de datos que afecten tablas existentes.
- Cualquier migración que toque datos ya guardados.
- Agregar, quitar o cambiar una dependencia del stack.
- Cambiar cómo funciona el aislamiento entre clínicas.
- Cambiar la estrategia de concurrencia o de bloqueo.
- Cambiar el modelo financiero o dónde se registra la cuenta por cobrar.
- Cambiar los enums de estado o sus transiciones permitidas (`REGLAS-DE-NEGOCIO.md` §4.4 y §4.5).
- Cambiar el modelo del odontograma o del historial clínico.
- Cualquier cosa que contradiga un ADR existente.
- Cualquier cosa marcada como "decisión pendiente" en `ARQUITECTURA.md` §19.

**Por qué antes y no después:** cuando el código ya está escrito, la discusión deja de ser "¿es correcto esto?" y pasa a ser "¿vale la pena tirar el trabajo?". Esa es una pregunta distinta, y se responde mal.

**Si contradice un ADR:** se escribe un ADR nuevo que lo supersede, con el motivo. **No se edita el ADR viejo.** Las decisiones equivocadas se documentan, no se borran — igual que el historial clínico.

---

# 6. Git

| Regla | Detalle |
|---|---|
| Rama por ciclo | `ciclo-N-descripcion-corta`. Nunca directo sobre `main`. |
| Un ciclo = un commit coherente | Mensajes en español, explicando **por qué**, no qué. |
| Commit | Solo cuando Carlos lo pide. |
| Push | Solo con autorización explícita. **Nunca en silencio.** |
| `--force` | **Nunca.** |
| `--no-verify` | **Nunca.** Si un hook falla, se arregla la causa. |
| Diff | Se muestra **antes** de pedir aprobación. Siempre. |

---

# 7. Fases del proyecto

**Se trabaja solo en la fase autorizada.** El orden no es sugerencia: las dependencias son reales.

| Fase | Alcance | Criterio de salida |
|---|---|---|
| **0. Fundación** | Scaffold Next.js + TS + Tailwind + shadcn. Prisma 7 + `prisma.config.ts` + Neon. Vitest. `infra/bootstrap-roles.sql`. Reglas ESLint. `src/lib/{money,dui,dientes,errors}.ts`. Documentación. | `npm test` verde en unitarias de `money` y `dui`. |
| **1. Auth + Tenant + Roles + RLS** | `Clinica`, `Sucursal`, `Usuario`, `Membresia`. Auth.js + JWT. `requireCtx()`, permisos. **Migración SQL: RLS + FORCE + políticas + default restrictivo + GRANTs por clase de tabla (ADR-012).** Auditoría. Semilla de dientes. Script de bootstrap de clínica. **SIN el módulo del operador de plataforma (ADR-011).** | **Pruebas de aislamiento, estructural de RLS, estructural de privilegios e integridad referencial verdes.** |
| **2. Agenda** | `Cita` + **migración SQL (`btree_gist` + **dos** `EXCLUDE` —odontólogo y paciente— + `CHECK`)**. Mapeo de `23P01`. Calendario. Preselección de paciente. | **Prueba de solapamiento verde**, incluida la carrera concurrente y el doble-agendado del paciente. |
| **3. Pacientes + Expediente** | `Paciente` + **migración SQL (columna generada `dui_enmascarado` + `CHECK` de formato + `CHECK` de responsable completo)**. `Expediente`, `AlertaMedica`. **Responsable y contacto de emergencia como columnas denormalizadas** (§19 #11) — *no* una entidad aparte. Búsqueda por nombre, teléfono y DUI. | **Prueba de enmascarado verde.** Menor de 18 sin responsable → rechaza. |
| **4. Catálogo** | Categorías, tratamientos, semilla de plantillas, `clonarCatalogo()`, CRUD con banderas. | Sin tratamientos duplicados por superficie. |
| **5. Diagnósticos** | `Diagnostico`, `DiagnosticoDiente`, selector de alcance, picker multi-diente/multi-superficie. | Un dx con 3 dientes y 5 superficies se guarda y se lee. |
| **6. Odontograma** | Eventos, proyección, `reducer.ts`, `rebuild.ts`, SVG 32+20, timeline, anulación **recalculada** (§10.1). | **Equivalencia de caminos verde** (el rebuild no cambia lo que escribió el camino en vivo); ningún evento se pierde. |
| **7. Planes** | Planes, ítems, precio acordado por paciente y snapshot al crear, estados independientes (enums en `REGLAS-DE-NEGOCIO.md` §4.4). | **Prueba de precio libre y congelado verde.** |
| **8. Procedimientos** | Procedimientos, enmiendas, anulación, generación de eventos, ventana de gracia. **Migración SQL: `REVOKE UPDATE ON procedimientos` + `GRANT UPDATE (columnas mutables)`** — en ese orden (ADR-012). | Realizar un procedimiento pinta el odontograma y avanza el plan. **Un `UPDATE` del precio aplicado → *permission denied*.** |
| **9. Caja** | Cargos, líneas, pagos, aplicaciones. **Un cobro por `PlanItem` o cuotas por exactamente el mismo total.** Dos contadores + dos `CHECK` (cargo y pago). Anulación de `Pago`. Reversas negativas (solo completas). **`fechaExigibleEn` + los cuatro saldos (ADR-013).** Lista de tratamientos realizados sin cargo. Pagos parciales. `DocumentoFiscal` vacío + `NoopDteProvider`. | **Prueba presupuesto≠deuda verde.** **18 cuotas de $60 → exigible $60, no $1,080.** **Tratamiento de $150 en varias sesiones → total cargado $150.** Saldos cuadran. |
| **10. Inventario** | Materiales, movimientos, alertas, estado vacío. | Movimientos append-only. |
| **11. Dashboard + Historial** | KPIs reales. Timeline clínico unificado. | Carlos ve el flujo completo de un paciente en una pantalla. |
| **12. Endurecimiento + Responsividad** | Cobertura, `npm audit`, rate limit en login, respaldos, ADRs, revisión de permisos. Responsividad en desktop/laptop/tablet/móvil. | Todo verde en CI. Sin scroll horizontal innecesario. |

**Dependencias:** 1 bloquea todo. 4 bloquea 7. 5 bloquea 6 y 7. 7 bloquea 8. 8 bloquea 9. Las fases 2, 3 y 10 son independientes tras la 1.

**Aclaración de ejecución:** aunque las fases 2 y 3 son funcionalmente independientes tras la 1,
`Cita` tiene una FK compuesta hacia `Paciente`. Por tanto, la ejecución comienza con un segmento
mínimo de la fase 3 (identidad, clínica y búsqueda del paciente), continúa con el motor y la UI de
la fase 2, y completa después el expediente de la fase 3. Esta partición conserva el modelo de
datos y evita crear una agenda que no pueda persistirse con integridad referencial.

**Recomendación:** entregar 1→2→3 primero y usar esa agenda con una clínica real antes de diseñar en detalle el odontograma y Caja, que son las partes caras. Una semana de uso real cambia supuestos que hoy son teoría.

## Fuera de alcance hasta nuevo aviso

- **DTE.** Existe el seam. Nada más. **No se inventa lógica tributaria.**
- **Consumo clínico integrado con inventario.**
- **Suscripciones, Stripe, registro público, onboarding automatizado.**
- **Interfaz de sucursales** (la entidad existe; la UI no).
- **Radiografías / almacenamiento de archivos.** Requiere ADR propio: sería el primer dato de paciente fuera de PostgreSQL (`ARQUITECTURA.md` §19 #6).
- **Módulo del operador de plataforma.** Diseñado y aprobado (`ARQUITECTURA.md` §7), **aplazado hasta la clínica #2** (ADR-011). Mientras tanto, bootstrap por script.

---

# 8. Cómo se registra un ciclo

Cada ciclo cerrado deja rastro en dos lugares:

1. **El historial de Git**: rama + commit con mensaje explicativo en español.
2. **Un ADR en `docs/ADR/`**, solo si el ciclo tomó una decisión estructural difícil de revertir.

Los ciclos rutinarios no llevan ADR. Los ADR son para decisiones que alguien, dentro de un año, va a querer cambiar sin entender por qué se tomaron.
