# CLIDENT

Sistema multi-clínica para la gestión operativa y clínica de consultorios odontológicos.

## Estado del proyecto

Las fases de Fundación y Auth + Tenant + Roles + RLS están implementadas en `main`.
El sistema cuenta con:

- Aplicación Next.js con TypeScript, Tailwind CSS y componentes preparados para shadcn/ui.
- Prisma 7 con migraciones versionadas y cliente generado fuera del control de versiones.
- Neon Postgres con ramas separadas para desarrollo, pruebas y producción.
- Aislamiento multi-clínica mediante RLS forzado, políticas PostgreSQL y claves foráneas compuestas.
- Autenticación con Auth.js Credentials, sesiones JWT y contraseñas Argon2id.
- Invitaciones de un solo uso con token aleatorio, hash SHA-256 y caducidad de 24 horas.
- Roles `ADMINISTRADOR`, `ODONTOLOGO`, `RECEPCION` y `CAJA`.
- Contextos `requireAuth()` y `requireCtx()` con revalidación de membresía por solicitud.
- Auditoría append-only y privilegios de base de datos separados por clase de tabla.
- Catálogo global inicial de dientes y superficies.

La agenda, los pacientes, el expediente clínico, el odontograma, los planes, los procedimientos,
la caja, el inventario y el dashboard forman parte del roadmap de la primera versión funcional.

## Arquitectura

| Capa | Tecnología o regla |
|---|---|
| Aplicación | Next.js 16, React 19, TypeScript |
| Estilos | Tailwind CSS 4 y componentes compatibles con shadcn/ui |
| Persistencia | PostgreSQL administrado por Neon |
| ORM | Prisma 7 y `prisma.config.ts` |
| Identidad | Auth.js Credentials, JWT y Argon2id |
| Validación | Zod |
| Pruebas | Vitest, pruebas unitarias y pruebas reales contra Neon |
| Despliegue | Vercel para la aplicación; Neon para PostgreSQL |

Las reglas de negocio, el modelo de datos y las decisiones estructurales se mantienen en la
documentación canónica:

- [Arquitectura](docs/ARQUITECTURA.md)
- [Reglas de negocio](docs/REGLAS-DE-NEGOCIO.md)
- [Flujo de desarrollo](docs/FLUJO-DE-DESARROLLO.md)
- [ADRs](docs/ADR/)

## Seguridad multi-clínica

La aplicación utiliza dos roles de PostgreSQL en runtime:

- `clident_app`: único rol disponible para Next.js y Vercel.
- `clident_migrator`: dueño de migraciones y bootstrap; no existe en el runtime de la aplicación.

`MIGRATION_DATABASE_URL` provoca un aborto inmediato si llega al runtime. Las consultas de tablas
de clínica se ejecutan dentro de una transacción que fija `app.usuario_id` y, cuando corresponde,
`app.clinica_id` con `set_config(..., true)`. El cliente Prisma generado y el acceso directo a la
base están restringidos por ESLint a los módulos autorizados.

Los secretos no se almacenan en Git. `.env.example` contiene únicamente nombres y marcadores;
los valores reales se inyectan mediante el entorno local ignorado y las variables cifradas del
proveedor de despliegue.

## Requisitos

- Node.js compatible con la versión utilizada por Next.js 16.
- npm.
- Acceso autenticado al proyecto de Neon para desarrollo y pruebas.
- Acceso al proyecto de Vercel para despliegues.

## Configuración local

1. Instalar dependencias:

   ```powershell
   npm install
   ```

2. Copiar `.env.example` al archivo de entorno local ignorado por Git.

3. Definir:

   - `DATABASE_URL`: conexión de `clident_app`, preferiblemente agrupada mediante el pooler de Neon.
   - `AUTH_SECRET`: secreto aleatorio de al menos 32 caracteres.

4. Generar el cliente Prisma:

   ```powershell
   npm run prisma:generate
   ```

5. Iniciar el servidor de desarrollo:

   ```powershell
   npm run dev
   ```

Las migraciones nunca se ejecutan desde una ruta HTTP ni con `clident_app`. Se despliegan con
`clident_migrator` desde el pipeline autorizado o mediante el procedimiento operativo documentado.

## Comandos de validación

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Las pruebas de integración requieren explícitamente:

- `TEST_DATABASE_URL` con `clident_app` en la rama `pruebas`.
- `TEST_MIGRATION_DATABASE_URL` con `clident_migrator` en la rama `pruebas`.
- `TEST_DATABASE_CONFIRM=pruebas`.

El arnés de integración trunca datos de la rama de pruebas. No debe apuntar a producción.

## Bootstrap y catálogo global

El bootstrap manual crea una clínica en estado `PRUEBA`, una `Sede principal`, el usuario
administrador, su membresía y el registro de auditoría. Se ejecuta exclusivamente con
`MIGRATION_DATABASE_URL` y `clident_migrator`.

La semilla de dientes es global e idempotente:

```powershell
npm run seed:dientes
```

La invitación del primer administrador se genera con `MIGRATION_DATABASE_URL` y devuelve una
ruta de un solo uso. El token visible no se guarda en la base; únicamente se almacena su hash.

```powershell
npm run invitar-admin -- correo@ejemplo.com
```

## Estructura del repositorio

```text
src/app/                 Rutas, pantallas y endpoints Next.js
src/lib/                 Utilidades puras y constantes globales
src/server/auth/         Auth.js, credenciales, permisos y contexto
src/server/db/           Cliente Prisma, transacciones tenant y SQL autorizado
prisma/                  Schema, migraciones y semillas
infra/                   Bootstrap y operaciones de infraestructura
tests/unit/              Pruebas unitarias
tests/integration/       Pruebas reales contra Neon
docs/                    Arquitectura, reglas, flujo y ADRs
```

## Roadmap de la primera versión

El orden de dependencias es deliberado:

1. Paciente base: identidad, DUI enmascarado, responsables y búsqueda.
2. Agenda: citas, concurrencia, restricciones de solapamiento y calendario.
3. Expediente: alertas, pestañas y datos clínicos iniciales.
4. Catálogo y tratamientos.
5. Diagnósticos.
6. Odontograma basado en eventos y proyección reconstruible.
7. Planes de tratamiento.
8. Procedimientos.
9. Caja, cargos, pagos, cuotas y saldos exigibles.
10. Inventario.
11. Dashboard e historial unificado.
12. Endurecimiento, backups, rate limiting, CI y responsividad.

El roadmap detallado y sus criterios de salida se mantienen en
[FLUJO-DE-DESARROLLO.md](docs/FLUJO-DE-DESARROLLO.md).

## Fuera de alcance del MVP

- Agenda pública sin autenticación.
- Radiografías y almacenamiento de archivos.
- DTE real y lógica tributaria.
- Suscripciones, Stripe y registro público.
- Interfaz del operador de plataforma.
- Interfaz de sucursales.
- Integración automática entre consumo clínico e inventario.

Cada ampliación estructural requiere revisión de arquitectura y, cuando corresponda, un ADR
nuevo. La implementación no debe adelantar fases ni sustituir las decisiones documentadas.
