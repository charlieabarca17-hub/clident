# ADR — Registros de Decisiones de Arquitectura

Un ADR (*Architecture Decision Record*) documenta **una decisión estructural difícil de revertir**: qué se decidió, por qué, qué se descartó y qué cuesta cambiarlo.

## Para qué sirven

Dentro de un año, un agente de IA va a mirar el código de CLIDENT y va a proponer "simplificar" algo: quitar el snapshot de precios porque está duplicado, convertir el odontograma en una tabla mutable porque es más fácil, o normalizar una relación que parece redundante. **El ADR es la respuesta a esa propuesta.**

Los ADR existen porque las decisiones de este proyecto tienen razones que no se ven en el código. Un campo duplicado parece un error hasta que sabés que congela un precio histórico.

## Reglas

1. **Un ADR nunca se edita para cambiar la decisión.** Si la decisión cambia, se escribe un ADR nuevo que **supersede** al anterior, y el viejo se marca como superseded con un enlace.
2. **Las decisiones equivocadas no se borran.** Se documentan. Igual que el historial clínico.
3. Solo se escribe ADR para decisiones **estructurales y difíciles de revertir**. Los ciclos rutinarios no llevan ADR.
4. Todo ADR dice explícitamente **qué se descartó y por qué** — esa es la parte más valiosa.

## Índice

| ADR | Decisión | Estado |
|---|---|---|
| [ADR-001](ADR-001-multitenancy-rls.md) | Multi-tenancy por `clinicaId` + RLS | Aceptado |
| [ADR-002](ADR-002-clinica-sucursal.md) | `Clinica` y `Sucursal` desde el inicio | Aceptado |
| [ADR-003](ADR-003-usuario-membresia-roles.md) | Usuario global + Membresías + múltiples roles | Aceptado |
| [ADR-004](ADR-004-fk-compuestas.md) | Foreign keys compuestas multi-tenant | Aceptado |
| [ADR-005](ADR-005-odontograma-eventos.md) | Odontograma basado en eventos append-only | Aceptado |
| [ADR-006](ADR-006-snapshot-precios.md) | Snapshot histórico de tratamientos y precios | Aceptado |
| [ADR-007](ADR-007-deuda-nace-en-cargo.md) | La deuda nace exclusivamente en `Cargo` | Aceptado |
| [ADR-008](ADR-008-agenda-exclude.md) | Agenda protegida por `EXCLUDE` constraint | Aceptado |
| [ADR-009](ADR-009-centavos-enteros.md) | Centavos enteros para dinero | Aceptado |
| [ADR-010](ADR-010-npm-neon-postgres-real.md) | npm + Neon + PostgreSQL real en pruebas | Aceptado |

## Formato

```markdown
# ADR-NNN — Título

- Estado: Propuesto | Aceptado | Superseded por ADR-XXX
- Fecha: AAAA-MM-DD
- Ciclo: N

## Contexto
Qué problema hay que resolver y qué restricciones aplican.

## Decisión
Qué se decidió, en una frase, y cómo funciona.

## Alternativas descartadas
Qué más se consideró y por qué se descartó. La parte más valiosa.

## Consecuencias
Qué gana el proyecto, qué cuesta, qué queda frágil.

## Costo de revertir
Qué habría que hacer para cambiar esto después.
```
