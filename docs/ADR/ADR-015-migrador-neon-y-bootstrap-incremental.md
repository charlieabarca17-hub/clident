# ADR-015 — Migrador Neon sin bypass y bootstrap incremental

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 4A
- **Supersede parcialmente:** ADR-011 — solo la clonación del catálogo durante el bootstrap
- **Relacionado:** ADR-001, ADR-010, ADR-012

## Contexto

Neon concede `neon_superuser` a los roles creados por Console/CLI/API. Ese rol incluye
`BYPASSRLS`, por lo que no sirve para `clident_app`, `clident_migrator` ni
`clident_readonly`. Los roles de CLIDENT se crean mediante SQL y nacen sin esos poderes.

Además, el bootstrap de Fase 1 decía que debía clonar el catálogo, aunque las tablas y
plantillas del catálogo no existen hasta la Fase 4. Ejecutar esa promesa exigiría adelantar
una fase completa o dejar un script que no puede correr.

## Decisión

`clident_migrator` se mantiene con `NOBYPASSRLS`. Cada tabla de inquilino declara una
política explícita `TO clident_migrator USING (true) WITH CHECK (true)`. La credencial
solo existe durante migraciones, mantenimiento y pruebas, nunca en el runtime.

El bootstrap de Fase 1 crea, en una transacción, clínica, sede principal, usuario
administrador, membresía y auditoría. La clonación del catálogo se agrega en Fase 4.

## Alternativas descartadas

**Crear el migrador con Neon CLI.** Le concede `neon_superuser` y evade RLS de forma
global; contradice el mínimo privilegio.

**Usar `neondb_owner` para migraciones.** Mezcla la cuenta propietaria con la credencial
automatizada de CI y amplía innecesariamente el radio de daño.

**Crear el catálogo en Fase 1.** Viola el orden aprobado y mezcla dos objetivos en un ciclo.

## Consecuencias

Las capacidades del migrador quedan visibles por tabla y entran en la prueba estructural.
Agregar una tabla exige agregar tanto su política de aplicación como la de mantenimiento.
El bootstrap inicial es ejecutable desde su primera versión, pero una clínica creada antes
de Fase 4 no tendrá catálogo hasta correr la clonación de esa fase.

## Costo de revertir

Bajo antes de producción: cambiar políticas y el bootstrap. Alto después, porque conceder
`BYPASSRLS` convertiría cualquier fuga de la credencial de migración en acceso irrestricto
a expedientes de todas las clínicas.
