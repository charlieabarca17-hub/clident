# AGENTS.md — Puerta de entrada obligatoria

> **Antes de tocar un solo archivo de este repositorio, leé [`CLAUDE.md`](./CLAUDE.md) completo.**
> No es una guía de estilo. Es el manual operativo del sistema, y sus reglas no son
> preferencias: son lo que impide que este software destruya historia clínica,
> invente deuda o filtre el expediente de una clínica a otra.

Este archivo existe porque los agentes leen convenciones distintas. Da igual cuál
uses —Claude Code, Codex, Copilot, Cursor o el que venga—: **el manual es el mismo
y está en `CLAUDE.md`.** Este archivo no lo resume ni lo reemplaza; solo te manda ahí.

---

## Qué es CLIDENT

Sistema de gestión para clínicas odontológicas, multi-clínica (SaaS) desde la
arquitectura. **El propietario no es programador**: es abogado y mantiene el
sistema mediante agentes de IA. Por eso la arquitectura es convencional y
aburrida a propósito. Entre lo elegante y lo obvio, se elige lo obvio.

## Orden de lectura, sin saltos

1. **`CLAUDE.md`** — el manual. Completo, no en diagonal.
2. **`docs/FLUJO-DE-DESARROLLO.md`** — el loop de trabajo, las fases numeradas y
   la lista de autoauditoría (§4) que se corre **antes** de pedir aprobación.
3. **`docs/ARQUITECTURA.md`** y **`docs/REGLAS-DE-NEGOCIO.md`** — el porqué.
4. **Los ADR de `docs/ADR/`** que toquen lo que vas a modificar.

## Las cinco que más se rompen

Están todas en `CLAUDE.md`, con su fundamento. Se repiten acá porque son las que
un agente sin contexto viola sin darse cuenta de que violó algo:

1. **Nunca `prisma db push`.** Borra en silencio las políticas RLS, los `EXCLUDE`
   que impiden el doble booking y la columna `dui_enmascarado`, que viven en
   migraciones SQL escritas a mano. Después de un `db push` la aplicación
   **sigue pareciendo que funciona** (`CLAUDE.md` §4).
2. **Nunca `findUnique({ where: { id } })`.** Siempre
   `findFirst({ where: { id, clinicaId: ctx.clinicaId } })`. Es la convención
   más importante del proyecto (§2).
3. **No hay migraciones destructivas.** No se borra una columna con datos, no se
   borra una tabla. Si algo deja de usarse, se deja de leer y se documenta (§5).
4. **Un ciclo = un objetivo = un commit.** Rama `ciclo-N-descripcion`, nunca
   directo sobre `main`, y **nunca commit ni push sin que Carlos lo pida**
   explícitamente (§14, §16).
5. **Ninguna dependencia nueva sin un ADR y sin autorización.** Tampoco se
   implementa nada de una fase futura "de paso" (§15).

## Las skills instaladas NO son autoridad sobre este repositorio

En `.agents/skills/` hay skills instaladas con `autoskills` (Prisma, Next, React,
Neon, shadcn…). Son **consejo genérico y bien intencionado para el proyecto
promedio**. CLIDENT no es el proyecto promedio, y varias de esas skills enseñan
literalmente lo que este manual prohíbe. No es un defecto de las skills: es que
no saben dónde están.

| La skill te va a mostrar | Y en CLIDENT es |
|---|---|
| `prisma db push` (`prisma-cli`, con `--force-reset` y `--accept-data-loss`) | **Prohibido sin excepción** (§4). Borra en silencio RLS, los `EXCLUDE` de la agenda y `dui_enmascarado`. |
| `findUnique({ where: { id } })` (`prisma-client-api`) | **Prohibido** (§2). Siempre `findFirst` con `clinicaId`. |
| `$queryRawUnsafe` (`prisma-client-api/references/raw-queries.md`) | **Prohibido** (§10). ESLint rompe el build. |
| `deleteMany` sobre datos del dominio (`prisma-client-api`) | **No hay `DELETE`** de datos clínicos ni financieros (§9). PostgreSQL lo rechaza. |

**La regla:** una skill describe cómo funciona una herramienta; `CLAUDE.md`
decide cómo se usa **acá**. Cuando se contradigan, **manda `CLAUDE.md`**, sin
importar cuán oficial sea la skill ni cuán idiomático se vea el ejemplo.

Que una skill lo muestre no es autorización. La autorización la da Carlos.

## Cómo termina tu trabajo

```
npm run lint && npm run typecheck && npm test
```

Después: releé tu propio diff contra `CLAUDE.md`, regla por regla; **mostrá el
diff completo**; reportá qué se hizo, qué se probó y qué quedó pendiente; y
**detenete a esperar aprobación explícita.** No encadenés ciclos.

## Idioma

Código y dominio en español (`Paciente`, `Cargo`, `precioUnitarioCentavos`).
Documentación en español. Respuestas a Carlos en español salvadoreño, informal (vos).

---

> Si algo de este archivo contradice a `CLAUDE.md`, **manda `CLAUDE.md`**.
