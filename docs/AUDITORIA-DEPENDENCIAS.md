# Auditoría de dependencias — 21 de septiembre de 2026

> **Este documento reporta y propone. No se actualizó ninguna dependencia.**
> Cambiar una pieza del stack es decisión estructural (`FLUJO-DE-DESARROLLO.md` §5)
> y necesita aprobación de Carlos **antes** de ejecutarse. Corresponde al Ciclo 26
> del plan; aplicar lo que Carlos apruebe es el Ciclo 27.

Comando: `npm audit` · Resultado: **24 avisos — 3 críticos, 13 altos, 8 moderados.**

---

## 1. Lo primero: la trampa

**`npm audit fix --force` propondría bajar Prisma de 7.8 a 6.19.3.** No es una
corrección: es un *downgrade* de versión mayor que rompería `prisma.config.ts`, que
existe porque Prisma 7 sacó la URL de `schema.prisma` (`CLAUDE.md` §17). El comando
dice "breaking change" en letra chica y sigue adelante.

**Nunca corras `npm audit fix --force` en este repositorio.** Lo que hay que hacer
se decide aviso por aviso, abajo.

---

## 2. Los tres críticos

Los tres se arreglan **sin cambio de versión mayor**, pero ninguno se arregla con
`npm audit fix` a secas, porque `package.json` fija las dos versiones exactas
(`"next": "16.2.10"`, `"next-auth": "5.0.0-beta.31"`): hay que subir el número a mano.

### 2.1 `next` 16.2.10 → 16.3.5 — **recomendado**

Once avisos acumulados, dos de ellos críticos:

| Aviso | ¿Aplica a CLIDENT? |
|---|---|
| Ejecución remota de código sin autenticar en servidores **Windows** | **No.** CLIDENT corre en Vercel, sobre Linux. |
| Ejecución remota de código en la **API de optimización de imágenes** con archivos AVIF | **Probablemente no, pero no se puede afirmar:** el sistema no sube ni sirve imágenes de usuario (las radiografías están fuera de alcance hasta la etapa F). La ruta de optimización existe igual porque la trae Next. |
| Falsificación de petición del lado del servidor (SSRF) en Server Actions | **Sí, en principio.** CLIDENT usa Server Actions en todo el sistema. |
| Denegación de servicio en Server Actions | **Sí, en principio.** |
| Confusión de caché en respuestas con cuerpo | **Sí, en principio.** |

De paso arrastra el arreglo de `sharp` y de `postcss`, que cuelgan de Next.

**Riesgo del cambio:** es un salto de parche dentro de la misma versión mayor. Bajo,
pero no nulo — hay que correr el gate completo después.

### 2.2 `next-auth` beta.31 → beta.32 (arrastra `@auth/core`) — **recomendado**

El aviso crítico dice que un error de configuración puede hacer que los chequeos de
autenticación **fallen abiertos**: `auth()` devuelve un objeto poblado con un error
en vez de nada, y el código que solo pregunta "¿hay sesión?" deja pasar.

> **Verificado en el código: CLIDENT no usa ese patrón.** `requireCtx()`
> (`src/server/auth/context.ts`) no pregunta si hay objeto de sesión; exige
> `sesion.user.id` y después **revalida la membresía contra la base de datos** con
> `validarMembresiaActiva()`. Un objeto de sesión poblado con un error no tiene
> `user.id`, y aunque lo tuviera, la consulta de membresía es la que manda.

Los otros dos avisos altos tampoco alcanzan a CLIDENT hoy: el del normalizador de
correo con homoglifos es del proveedor de correo (CLIDENT solo usa `Credentials` con
argon2), y el de las cookies de `state`/`nonce`/PKCE es del flujo OAuth de Auth.js
(el OAuth de Google Calendar es propio, con `state` firmado con HMAC-SHA256).

**Conclusión honesta:** ninguno de los tres es explotable hoy en CLIDENT. Se
recomienda subir igual, porque la protección contra el fail-open depende de que nadie
escriba en el futuro un `if (await auth())`, y eso es disciplina, no mecanismo.

---

## 3. Lo que exige decisión aparte (versión mayor)

| Paquete | Arreglo que propone npm | Qué significa |
|---|---|---|
| `prisma` (CLI) | **6.19.3 — es bajar de versión** | 🔴 **No hacer.** Rompe `prisma.config.ts` y contradice `CLAUDE.md` §17. El arreglo correcto es esperar una 7.x parchada. |
| `vitest` | 5.0.1 (mayor) | Solo desarrollo. El aviso es lectura arbitraria de archivos vía el mocker; no corre en producción ni en la máquina de un paciente. Actualizable cuando haya tiempo y con el gate como red. |
| `@prisma/dev`, `mysql2`, `valibot`, `hono`, `@hono/node-server`, `deepmerge-ts`, `@prisma/config` | vía `prisma` | Cuelgan del CLI de Prisma. **CLIDENT no usa MySQL**: `mysql2` viene porque el CLI soporta varios motores. Se resuelven solos cuando Prisma publique la versión parchada. |

---

## 4. Los demás

`undici`, `nanoid`, `browserslist`, `brace-expansion`, `qs`, `js-yaml`, `fast-uri`,
`ip-address`, `baseline-browser-mapping`: transitivos de las herramientas de build y
del CLI de Prisma. Ninguno es dependencia directa. Se arreglan con `npm audit fix`
(sin `--force`) o solos, al subir Next y Prisma.

`sharp` y `@vitest/mocker` no llegan al paquete de producción de esta aplicación
—`sharp` lo instala Vercel para optimizar imágenes, que CLIDENT no usa hoy.

---

## 5. Propuesta

**Recomendado para el Ciclo 27, en un solo paso y con el gate completo detrás:**

1. Subir `next` de `16.2.10` a `16.3.5` en `package.json`.
2. Subir `next-auth` de `5.0.0-beta.31` a `5.0.0-beta.32`.
3. Correr `npm audit fix` **sin `--force`** para los transitivos.
4. Gate completo: lint, typecheck, 212 unitarias, **140 de integración** y build.

**No hacer, hasta nuevo aviso:** tocar Prisma, ni con `audit fix --force` ni a mano.

**Decisión de Carlos:** si autoriza los pasos 1 a 3 tal como están, o si prefiere
esperar. Ninguno de los tres críticos es explotable hoy en CLIDENT, así que **no hay
urgencia de horas**; sí conviene no dejarlo pasar semanas, porque cada semana el
número sube y la actualización se vuelve más grande.
