# ADR-011 — Aplazamiento del operador de plataforma hasta la clínica #2

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 1
- **Relacionado:** ADR-001 (multitenancy + RLS), ADR-003 (usuario + membresía + roles)

## Contexto

`ARQUITECTURA.md` §7 diseña un **operador de plataforma**: el rol que crea clínicas, invita administradores y suspende cuentas, **sin poder leer un solo expediente**. No por política ni por promesa: por ausencia de privilegio en PostgreSQL.

El diseño es bueno y la garantía es real. Lo que este ADR cuestiona no es *si* debe existir, sino *cuándo se construye*.

Construirlo completo cuesta, en la Fase 1:

- un cuarto rol de PostgreSQL (`clident_operador`),
- una cuarta URL de base de datos (`OPERATOR_DATABASE_URL`),
- un cliente Prisma separado (`src/server/db/operador.ts`),
- una regla de ESLint dedicada a restringir su import,
- políticas RLS `TO clident_operador` sobre 4 tablas,
- un árbol de rutas `/operador/*` con su guard,
- y el truco de `INSERT` sin `SELECT` sobre el catálogo — genuinamente ingenioso y genuinamente inverificable por el propietario.

Todo eso para hacer cumplir *"el operador de CLIDENT no puede leer expedientes"* en un momento en que **el operador es Carlos, la única clínica es la suya, y el expediente que el operador no puede leer es el suyo propio.**

La Fase 1 ya es la más grande del plan (`Clinica`, `Sucursal`, `Usuario`, `Membresia`, Auth.js, `requireCtx()`, permisos, la migración SQL de RLS + FORCE + políticas + GRANTs, auditoría, semilla de dientes) y **bloquea todo lo demás**. Y `FLUJO-DE-DESARROLLO.md` §7 recomienda explícitamente *"entregar 1→2→3 primero y usar esa agenda con una clínica real antes de diseñar en detalle el odontograma y Caja"*, porque *"una semana de uso real cambia supuestos que hoy son teoría"*.

La consola del operador no acerca a esa semana de uso real.

## Decisión

**El módulo del operador de plataforma se aplaza hasta que exista una segunda clínica.**

El diseño de `ARQUITECTURA.md` §7 y la regla de `REGLAS-DE-NEGOCIO.md` §6.4 **quedan aprobados y sin cambios**. Lo que se aplaza es construirlos, no decidirlos.

### Qué NO se construye en la Fase 1

El rol `clident_operador`, `OPERATOR_DATABASE_URL`, `src/server/db/operador.ts`, la regla de ESLint que restringe su import, las políticas `TO clident_operador`, el árbol `/operador/*` y su guard.

### Qué hace la Fase 1 en su lugar

Un **script de bootstrap** versionado en `infra/`, corrido a mano con `clident_migrator` — el rol de migraciones, que ya existe, ya está fuera de Vercel (solo secreto de GitHub Actions) y ya sabe crear cosas. Ejecuta los mismos flujos de §7: crear clínica + sede principal + usuario admin + clonar catálogo desde plantillas + auditoría, en una transacción.

### Qué se conserva desde el día uno

`Usuario.esOperadorPlataforma` y `Clinica.estado`. Son columnas, cuestan cero, y el modelo las necesita igual. **Quitarlas ahora para volver a agregarlas después sería una migración gratuita en la dirección equivocada.**

### Cuándo se levanta el aplazamiento

**Cuando exista un segundo cliente.** No antes, y no después: el día que una clínica ajena tenga datos en el sistema, la garantía del §6.4 deja de ser teoría y pasa a ser lo primero que hay que construir.

## Alternativas descartadas

**Construirlo completo en la Fase 1**, como decía el plan original. Descartada por costo de oportunidad, no porque el diseño esté mal. Es maquinaria contra una amenaza que todavía no existe, en la fase que ya bloquea todo el proyecto. La diferencia es entregar la Fase 1 en una semana o en tres.

**Quitar el diseño del §7 y decidirlo cuando llegue.** Descartada. El diseño ya está pensado y bien pensado; tirarlo significaría volver a pensarlo con menos contexto del que hay hoy. Además `FLUJO-DE-DESARROLLO.md` §8 dice que las decisiones se documentan, no se borran. **Se conserva como diseño aprobado, marcado como aplazado.**

**Crear las clínicas con un superusuario "mientras tanto".** Descartada sin discusión. Contradice la regla de que ningún rol es superusuario (ADR-001) y es exactamente la clase de atajo temporal que se vuelve permanente. `clident_migrator` ya existe, ya tiene los privilegios necesarios, y su credencial ya está fuera del runtime.

**Un rol de operador "simplificado" ahora y el completo después.** Descartada: dos implementaciones del mismo mecanismo de seguridad, y la primera no tendría ninguna prueba real detrás porque no hay segunda clínica contra la cual probar el aislamiento.

## Consecuencias

**A favor:**
- La Fase 1 se achica sustancialmente y el proyecto llega antes a 1→2→3, que es donde el uso real empieza a corregir los supuestos.
- Menos superficie que mantener antes de tener un solo usuario.
- La decisión y su garantía quedan documentadas: nadie tiene que redescubrirlas.

**En contra:**
- **CLIDENT no se puede vender a una segunda clínica hasta que este módulo exista.** Es una dependencia dura y hay que recordarla al planificar comercialmente: el aplazamiento tiene fecha de vencimiento y la marca el negocio, no el código.
- Crear una clínica es manual y requiere que Carlos corra un script con la credencial de migraciones. Aceptable con una clínica; insostenible con varias.
- **Riesgo real:** que el aplazamiento se olvide y la clínica #2 entre con el bootstrap manual "por esta vez". Ese sería el momento exacto en que la promesa del §6.4 se vuelve falsa **sin que nadie lo note**. Mitigación: la regla del §6.4 sigue escrita como garantía en el documento canónico, y las aserciones de `clident_operador` están escritas en la suite `bootstrap` como pendientes explícitas de su fase.

**Lo que este ADR NO cambia:**
- La regla de `REGLAS-DE-NEGOCIO.md` §6.4 sigue vigente como garantía comprometida.
- El aislamiento entre clínicas (ADR-001) no se toca: RLS + FORCE + políticas + FK compuestas van completos en la Fase 1. **Lo aplazado es la consola del operador, no el aislamiento.**

## Costo de revertir

**Bajo, y el aplazamiento es aditivo.** Construir el módulo después es: agregar el rol al `bootstrap-roles.sql`, las políticas en una migración nueva, el cliente, la regla de ESLint y las rutas. **No migra ningún dato** — las columnas que hacían falta (`esOperadorPlataforma`, `Clinica.estado`) ya están desde la Fase 1, justamente para que esto sea barato.

Es el aplazamiento con mejor relación costo/beneficio del plan: se pospone el trabajo sin posponer ninguna de las decisiones que lo harían caro.
