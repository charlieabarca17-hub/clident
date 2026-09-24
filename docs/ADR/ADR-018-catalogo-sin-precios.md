# ADR-018 — El catálogo no contiene precios

- **Estado:** Aceptado — **superseded parcialmente por ADR-020** (22-sep-2026): la clínica vuelve a tener una tarifa habitual propia. Sigue vigente de este ADR: nada de precios en las plantillas de plataforma y ningún precio que el sistema imponga.
- **Fecha de la decisión:** 2026-07-19 · **Documentado:** 2026-07-23
- **Ciclo:** implementado fuera de ciclo (PR #19) · registrado en el Ciclo 24
- **Decidido por:** Carlos
- **Relacionado:** ADR-006, ADR-017

> **Este ADR se escribe después de que la decisión ya está en `main`.** El cambio
> entró por el PR #19 sin ADR previo, que es lo que `CLAUDE.md` §15 exige. Se
> documenta ahora porque el esquema y el manual se contradecían: el manual
> describía una columna que la base ya no tiene, y esa contradicción es
> exactamente lo que lleva a un agente futuro a "corregir" el esquema
> restaurando algo que se quitó a propósito. Ver *Deuda de proceso* al final.

## Contexto

El ADR-017 (17-jul) degradó `Tratamiento.precioListaCentavos` a **referencia
visual**: el precio clínicamente vinculante lo fija el odontólogo al crear el
`PlanItem`, para ese paciente, y queda inmutable.

Eso dejó una columna en una posición incómoda: un número con nombre de precio,
guardado en el catálogo, que **nunca** es el precio de nada. Un campo así es una
trampa de tres puntas:

1. **Para la interfaz.** Un formulario que lo precarga convierte "referencia" en
   "valor por defecto", y un valor por defecto es lo que la gente acepta sin
   pensar. El precio acordado por paciente —el punto entero del ADR-017— se
   vuelve teórico.
2. **Para los agentes.** `CLAUDE.md` §7 tiene que advertir, en negrita, que
   hacer join a `Tratamiento` por precio es un bug. La advertencia es necesaria
   porque **el campo existe**. Quitarlo hace la advertencia innecesaria: no se
   puede leer mal una columna que no está.
3. **Para el modelo de negocio.** Carlos vende a clínicas distintas, con precios
   distintos y hasta con odontólogos que cobran distinto dentro de la misma
   clínica. Una "lista de precios" central presupone algo que no es cierto.

Al mismo tiempo, el catálogo necesitaba dos cosas que sí faltaban: que la clínica
elija qué tratamientos usa (en vez de recibir la lista completa de plataforma), y
que cada odontólogo pueda nombrar los suyos como los nombra en su cabeza.

## Decisión

**El catálogo describe tratamientos. No los cotiza.**

1. **Se eliminan las dos columnas de precio del catálogo:**
   `tratamientos.precio_lista_centavos` y
   `plantillas_tratamiento.precio_sugerido_centavos`, con sus `CHECK` asociados.
   **El único precio del sistema nace en `PlanItem.precioUnitarioCentavos`**, lo
   escribe un humano y es inmutable (ADR-006, ADR-017).
2. **`Tratamiento.plantillaCodigo`** vincula el tratamiento de una clínica con la
   plantilla de plataforma de la que salió (`NULL` si es personalizado). La
   clínica **agrega** de un catálogo de referencia en vez de recibirlo entero.
3. **`PreferenciaTratamiento`** guarda, por `Membresia` —o sea por odontólogo, no
   por clínica—, un `alias` opcional y una bandera `favorito`. Es preferencia de
   presentación: **no toca el nombre del tratamiento ni nada clínico ni nada de
   dinero**, y por tanto no entra en ningún snapshot.

Las plantillas siguen sin `clinicaId`: son de plataforma y se copian
(`CLAUDE.md` §2). `PreferenciaTratamiento` sí es tabla de inquilino, con su
`@@unique([clinicaId, id])`, sus FK compuestas y su política RLS.

## Alternativas descartadas

**Dejar la columna y confiar en la advertencia del manual.** Es el estado que
traía el ADR-017. Descartada: la advertencia existía desde el Ciclo 0 y la
columna seguía siendo el primer lugar donde cualquiera —persona o agente— busca
un precio. Este proyecto tiene un principio para esto (`CLAUDE.md` §1): cuando el
mecanismo es legible, se hace cumplir en la base. Borrar la columna es el
mecanismo más legible que existe.

**Renombrarla a `precioReferenciaCentavos` o `precioSugeridoCentavos`.** Descartada:
resuelve la confusión de nombre, no la de comportamiento. Sigue siendo un número
precargable, y `...Centavos` sigue significando "esto es dinero" (§12).

**Moverla a `PreferenciaTratamiento`** (cada odontólogo con su propia lista de
precios sugeridos). Descartada por ahora: es una función de producto que nadie
pidió, y reintroduce el mismo default automático un nivel más abajo. Si algún día
se necesita, este ADR no la bloquea: sería un ADR nuevo con su propia discusión.

**Vaciar los valores dejando la columna** (todo en `NULL`). Descartada: es lo
peor de los dos mundos — mantiene el campo que invita al join y agrega una rama
`NULL` que alguien va a tener que manejar en cada lectura.

## Consecuencias

**A favor:**
- El precio de un tratamiento **solo puede** salir de una decisión humana
  registrada en un `PlanItem`. No hay una segunda fuente que pueda desalinearse.
- La advertencia de `CLAUDE.md` §7 sobre el join a `Tratamiento` pasa de ser una
  regla que hay que recordar a un imposible estructural.
- El catálogo por clínica deja de ser una copia de 200 filas que nadie depura.

**En contra:**
- Una clínica que quisiera "sus precios de lista" para cotizar rápido ya no los
  tiene en el sistema. Es deliberado: cotizar rápido era justo lo que producía el
  precio-por-defecto que el ADR-017 quiso eliminar.
- El odontólogo escribe un monto cada vez. Es un campo más por tratamiento.

**Frágil:**

> **Este ADR se puede leer como "el catálogo está incompleto".** No lo está. Si
> un agente futuro propone "devolverle el precio al catálogo para mejorar la
> experiencia", **este documento es la respuesta**, junto con el ADR-017.

## Costo de revertir

**Estructuralmente bajo, con pérdida de datos.** Volver a agregar las columnas es
una migración simple. Lo que no vuelve es su contenido: la migración
`20260720000100_catalogo_sin_precios_google_calendar` hizo `DROP COLUMN`, así que
los montos que hubiera en esas columnas **no son recuperables** desde la base —
solo desde un respaldo anterior al 20-jul-2026.

Nada de lo clínico ni de lo financiero dependía de esas columnas: los planes,
procedimientos y cargos ya trabajaban con sus propios snapshots (ADR-006). Por eso
la pérdida se limita al catálogo mismo.

## Deuda de proceso (para que no se repita)

El cambio entró **con `DROP COLUMN`**, que `CLAUDE.md` §5 prohíbe sin matices
("No hay migraciones destructivas. Nunca borres una columna con datos"), y **sin
el ADR previo** que §15 exige. La regla existe porque un `DROP` es la única
operación de este sistema cuyo daño no se puede deshacer desde adentro.

La decisión se ratifica —Carlos la aprobó y el diseño es correcto—, pero el
camino no se valida. La forma que correspondía era: ADR primero, y dejar de leer
la columna en vez de borrarla. La causa raíz fue que el agente que lo implementó
nunca leyó `CLAUDE.md`; el Ciclo 23 agrega `AGENTS.md` para cerrar esa puerta.
