# CLIDENT

Sistema multi-clínica para la gestión operativa y clínica de consultorios odontológicos.

## Estado del proyecto

**Las doce fases del roadmap inicial están implementadas.** El sistema cubre el ciclo completo
de una clínica: agendar, atender, diagnosticar, planificar, ejecutar, cobrar y controlar.

**Fundación y seguridad**

- Aislamiento multi-clínica en cuatro capas: contexto de sesión, filtro de repositorio,
  RLS forzado y claves foráneas compuestas.
- Autenticación Auth.js Credentials con Argon2id, sesiones JWT de 12 h y revalidación de
  membresía contra PostgreSQL en cada solicitud.
- Rate limit de login, invitaciones de un solo uso y 18 permisos granulares sobre 4 roles.
- Auditoría append-only y privilegios de base de datos por clase de tabla.

**Módulos funcionales**

| Módulo | Qué garantiza |
|---|---|
| Agenda | Dos `EXCLUDE` de PostgreSQL impiden el doble booking de odontólogo y de paciente. |
| Pacientes y expediente | DUI enmascarado por columna generada; alertas médicas append-only. |
| Catálogo | Plantillas de plataforma clonables; sin duplicación por superficie. |
| Diagnósticos | Separados del tratamiento; multi-diente y multi-superficie; anulables con motivo. |
| Odontograma | Eventos append-only con proyección derivada y `rebuild` verificado por equivalencia. |
| Planes | Precio acordado libre por paciente, congelado al crear e inmutable. |
| Procedimientos | Hecho clínico inmutable; nota editable 12 h y enmiendas que preservan el original. |
| Caja | Cobro único por tratamiento o cuotas por el mismo total; dos contadores y cinco saldos. |
| Inventario | Stock que no puede quedar negativo; movimientos append-only. |
| Tablero e historial | KPIs del día y el recorrido completo del paciente en una línea de tiempo. |

**Pendiente de entorno:** las migraciones deben aplicarse en Neon con `clident_migrator` y el
CI debe correr por primera vez. Ver [OPERACION.md](docs/OPERACION.md).

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
- [Operación y despliegue](docs/OPERACION.md)
- [Revisión de seguridad](docs/SEGURIDAD.md)
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

Las semillas globales son idempotentes y se ejecutan con `MIGRATION_DATABASE_URL`:

```powershell
npm run seed:dientes     # 52 dientes y 312 superficies
npm run seed:catalogo    # 12 categorías y 94 tratamientos de plantilla
```

Mantenimiento disponible como comando:

```powershell
npm run reconciliar          # los contadores de dinero y stock deben dar cero filas
npm run odontograma:rebuild  # regenera la proyección del odontograma desde sus eventos
```

La invitación del primer administrador se genera con `MIGRATION_DATABASE_URL` y devuelve una
ruta de un solo uso. El token visible no se guarda en la base; únicamente se almacena su hash.

```powershell
npm run invitar-admin -- correo@ejemplo.com
```

Si un usuario existente olvida su contraseña, el propietario puede invalidar la clave anterior y
generar una ruta de reemplazo de un solo uso, válida por 24 horas. El comando carga únicamente la
credencial de migración desde `.env.migracion`; nunca la expongás en la aplicación ni en Vercel.

```powershell
npm run restablecer-contrasena -- correo@ejemplo.com
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

## Roadmap

Las doce fases del roadmap inicial están completas. Sus criterios de salida se mantienen en
[FLUJO-DE-DESARROLLO.md](docs/FLUJO-DE-DESARROLLO.md).

Lo siguiente no pertenece a ninguna fase implementada y **exige decisión del propietario**
antes de construirse:

- Corte de caja (apertura, cierre y arqueo del día).
- Devolución de dinero en efectivo: el crédito a favor se reconoce, pero no existe entidad
  de dinero que sale.
- Política de mora: la mecánica está; el umbral de días es una decisión de negocio.
- Radiografías y archivos: sería el primer dato de paciente fuera de PostgreSQL y requiere
  su propio ADR de aislamiento.
- DTE real.

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
