# ADR-004 — Foreign keys compuestas multi-tenant

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 0

## Contexto

**Tener `clinicaId` en ambas tablas no impide nada.**

Una `Cita` con `clinicaId = A` apuntando a un `Paciente` con `clinicaId = B` produce **dos filas internamente coherentes**. RLS no lo detecta: RLS filtra *qué filas ves*, no *con qué se relacionan*. La aplicación tampoco, salvo que alguien recuerde validarlo en cada escritura.

El diseño original (ADR-001) dejaba esta integridad al aire. **Era un hoyo real**, detectado por el propietario en la revisión estructural del Ciclo 0.

Los cuatro casos concretos que había que volver imposibles:

- un `PlanItem` de la Clínica A apuntando a un `Tratamiento` de la B;
- un `Procedimiento` de A apuntando a un `Paciente` de B;
- una `Cita` de A apuntando a una `Membresia` de B;
- un `Pago` de A aplicado a un `Cargo` de B.

## Decisión

**Foreign keys compuestas en toda relación entre tablas de inquilino.**

1. Toda tabla de inquilino lleva `@@unique([clinicaId, id])` — es lo que la habilita como **destino** de FK compuesta.
2. Toda relación entre dos tablas de inquilino usa `[clinicaId, xId] → [clinicaId, id]`, con `@relation("nombre")` para desambiguar.
3. **`onUpdate: Restrict` explícito.** Prisma pone `CASCADE` por defecto; con FK compuesta, un cambio del `clinicaId` del padre **arrastraría al hijo a otra clínica**. Nunca pasa porque los ids no cambian, pero `Restrict` lo vuelve imposible en vez de improbable.

### Verificación empírica previa

La solución exige que una misma columna (`clinicaId`) participe en varias FK compuestas. Prisma tiene un historial de limitaciones ahí ([issue #8976](https://github.com/prisma/prisma/issues/8976): *"Prisma Schema can not represent multiple foreign keys on the same column"*, cerrado como *not planned*).

**No se asumió: se verificó** con un esquema desechable contra Prisma 7.8.0. Genera ambas:

```
Cita_clinicaId_pacienteId_fkey    FOREIGN KEY ("clinicaId","pacienteId")   REFERENCES "Paciente"("clinicaId","id")
Cita_clinicaId_odontologoId_fkey  FOREIGN KEY ("clinicaId","odontologoId") REFERENCES "Membresia"("clinicaId","id")
```

El issue #8976 trata de FKs **duplicadas hacia la misma tabla**, caso distinto. **Requisitos confirmados:** `@relation("nombre")` para desambiguar y `@@unique([clinicaId, id])` en el destino.

## La propiedad emergente

Como el `clinicaId` del hijo **participa en la FK**, la clínica del hijo y la del padre no son dos valores que se comparan: **son la misma columna**. No se validan — **no pueden diferir**.

Y encadena: `PlanItem → Plan → Paciente` queda amarrado en toda la cadena.

Efecto colateral valioso: **una fila no se puede mover de clínica.** Cambiar su `clinicaId` violaría todas sus FK a la vez.

## Alternativas descartadas

**Confiar en RLS.** No sirve: RLS decide qué filas ves, no la coherencia de las relaciones. Un `INSERT` con `clinicaId` correcto y `pacienteId` ajeno pasa la política sin problema.

**Validar en la aplicación** (leer el padre y comparar su `clinicaId` antes de escribir). Descartada: es una validación que hay que recordar en **cada** escritura de **cada** relación, para siempre, en un código mantenido por agentes de IA. Es exactamente el tipo de regla que se olvida en la función número 40. Y el fallo es silencioso.

**Solo en las relaciones "importantes".** Descartada: no hay forma de saber cuál será importante dentro de un año, y una regla con excepciones es una regla que nadie aplica.

## Consecuencias

**A favor:**
- Los cuatro casos son imposibles **a nivel de PostgreSQL**, no de aplicación.
- Cubre relaciones que nadie pensó en validar.
- Una fila no se puede mover de clínica.
- Es transitivo: amarra cadenas completas.

**En contra (casi nulo):**
- Cada FK compuesta exige un índice `(clinicaId, x)` — **que es exactamente el índice que las consultas de inquilino ya necesitaban**. Costo neto ≈ 0; en varios casos reemplaza uno que igual íbamos a crear.
- `@@unique([clinicaId, id])` agrega un índice por tabla, además del PK.
- Prisma exige `@relation("nombre")` en cada relación: más verboso.

**Excepciones (FK simple):**

| Relación | Razón |
|---|---|
| `X.clinicaId → Clinica.id` | `Clinica` **es** el inquilino; una compuesta sería `[clinicaId, clinicaId]` |
| `Membresia.usuarioId → Usuario.id` | `Usuario` es global **por diseño**: es exactamente el punto donde una identidad cruza clínicas (ADR-003). Una compuesta acá rompería el multi-clínica. |
| `Auditoria.usuarioId → Usuario.id` | Igual |
| `*.[fdi, superficie] → SuperficieDiente` | Tabla global inmutable; no hay inquilino que filtrar (ADR-005) |
| Plantillas del catálogo | Globales |

**`ON DELETE RESTRICT` por defecto**, coherente con "no borrar datos clínicos". `Cascade` solo en tablas puente de dientes de entidades editables (`DiagnosticoDiente`, `PlanItemDiente`), donde editar los dientes de un borrador es delete+insert de filas puente.

## Costo de revertir

**Alto.** Está en cada relación del esquema. Quitarlo sería una migración masiva de constraints — y no habría motivo: el costo de mantenerlo es cerca de cero y lo que compra no tiene sustituto.
