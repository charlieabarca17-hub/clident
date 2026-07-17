# ADR-003 — Usuario global + Membresías + múltiples roles

- **Estado:** Aceptado
- **Fecha:** 2026-07-17
- **Ciclo:** 0

## Contexto

Dos problemas distintos que se resuelven con la misma estructura:

1. **Un odontólogo puede trabajar en varias clínicas.** Si el usuario perteneciera a una clínica, esa persona necesitaría dos cuentas y dos contraseñas.
2. **En la clínica salvadoreña típica, el dueño es odontólogo.** Necesita ser `ADMINISTRADOR` **y** `ODONTOLOGO` a la vez. No es un caso de borde: es el caso común.

## Decisión

**Separar identidad de pertenencia**, con el patrón estándar (organizaciones de GitHub, espacios de Slack):

```
Usuario (identidad global: correo, contraseña)      ← SIN clinicaId
   └── Membresia (usuarioId + clinicaId + roles[])  ← @@unique([usuarioId, clinicaId])
          └── Clinica
```

**`Membresia.roles Rol[]`** — arreglo de enum nativo de PostgreSQL. **Múltiples roles simples por membresía.**

```sql
ALTER TABLE membresias ADD CONSTRAINT membresia_con_rol CHECK (array_length(roles, 1) >= 1);
CREATE INDEX ON membresias USING gin (roles);   -- consultar: roles @> ARRAY['ODONTOLOGO']::rol[]
```

Resolución de permisos = unión: `roles.flatMap(r => PERMISOS_POR_ROL[r])`.

**El odontólogo no es una tabla aparte:** es una membresía con `ODONTOLOGO` entre sus roles. Sus datos profesionales (JVPO, especialidad, color de agenda) viven en la membresía, porque son datos de esa persona **en esa clínica**.

**Consecuencia de diseño:** `odontologoId` referencia una **`Membresia`**, no un `Usuario`. Esto hace que el `EXCLUDE` de la agenda (ADR-008) quede aislado por clínica automáticamente, y que "listar odontólogos de esta clínica" sea una sola consulta indexada.

**Autorización:** una matriz plana `Record<Rol, Permiso[]>` en un archivo, verificada en el servidor, en la primera línea de cada función de repositorio.

## Alternativas descartadas

**Un rol único por membresía.** Descartada. `ADMINISTRADOR + ODONTOLOGO` fuerza uno de tres desastres:

1. **Dos membresías del mismo usuario en la misma clínica** → rompe `@@unique([usuarioId, clinicaId])`, vuelve ambiguo `odontologoId` (¿cuál membresía realizó el procedimiento?) y desarma las FK compuestas (ADR-004).
2. **Rol combinado falso `ADMINISTRADOR_ODONTOLOGO`** → explosión combinatoria: admin+caja, recepción+caja, admin+odontólogo+caja…
3. **Meter los permisos clínicos dentro de `ADMINISTRADOR`** → un administrador no odontólogo (gerente de oficina) podría escribir notas clínicas y aparecería en la lista de odontólogos de la agenda. Incorrecto.

**Tabla puente `MembresiaRol`.** Compraría integridad referencial sobre los valores de rol — pero **los roles son un enum**, así que PostgreSQL ya garantiza el dominio. Costo: un join en cada verificación de permiso y una tabla que un agente debe acordarse de poblar. Cero beneficio.

**Motor ACL configurable (CASL, permisos por usuario, DSL de políticas).** Descartada por sobreingeniería. Son cuatro roles en una clínica dental. Una matriz que el propietario puede leer en voz alta vale más que un motor que nadie entiende. Cuando se pida "el odontólogo solo ve sus pacientes", será un `where` extra en una función, no un motor.

**Usuario con `clinicaId`.** Rompe el caso de trabajar en varias clínicas, que es real y común.

## Consecuencias

**A favor:**
- Un profesional en dos clínicas: un usuario, una contraseña, dos membresías, roles distintos en cada una.
- El operador puede crear una clínica e invitar a su administrador creando una membresía. Sin registro público.
- Los permisos se leen de un vistazo en un solo archivo — el punto exacto: un agente que agregue un módulo mira un archivo y sabe quién entra.

**En contra:**
- La sesión debe llevar qué clínica está activa, y elegirla es un paso extra del login (ver `ARQUITECTURA.md` §6).
- `Usuario` no tiene `clinicaId`, así que no lleva RLS. Excepción documentada y aceptada.

**Regla que NO se hace cumplir en la base (excepción consciente):**

`odontologoId` debería apuntar a una membresía que tenga `ODONTOLOGO`. **PostgreSQL no lo puede expresar en una FK**: el destino necesita un unique real, y no se puede referenciar "las filas que cumplen un predicado".

Se evaluó el truco de columna generada `es_odontologo` + FK de tres columnas. **Descartado:** compra una garantía chica al precio de una FK que ningún agente de IA va a entender. Por el principio rector, el mecanismo sería más confuso que el bug — y el bug es de dropdown equivocado (el dropdown se filtra en el servidor de todos modos), no una fuga ni un error de dinero.

**Se verifica en el repositorio + prueba.**

## Costo de revertir

**Alto.** Pasar de arreglo a rol único tocaría cada verificación de permiso y cada fila de membresía. Es exactamente la migración estructural que el propietario pidió evitar, y es la razón de decidirlo en el Ciclo 0: **decidirlo ahora cuesta cero.**
