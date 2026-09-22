# ADR-019 — Sincronización de citas con Google Calendar, por odontólogo y sin datos clínicos

- **Estado:** Aceptado
- **Fecha de la decisión:** 2026-07-19 · **Documentado:** 2026-07-23
- **Ciclo:** implementado fuera de ciclo (PR #19) · registrado en el Ciclo 25
- **Decidido por:** Carlos
- **Relacionado:** ADR-008 (agenda), ADR-001 (multitenancy), `docs/SEGURIDAD.md`

> **Este ADR se escribe después de que la decisión ya está en `main`.** La
> integración entró por el PR #19 sin ADR previo y agregando la dependencia
> `googleapis` sin autorización documentada, que es lo que `CLAUDE.md` §15 exige
> para ambas cosas. Se documenta ahora porque es la **primera vez que un dato de
> CLIDENT sale hacia un tercero**, y una decisión de ese tamaño no puede vivir
> solamente en un mensaje de commit. Ver *Deuda de proceso* al final.

## Contexto

La agenda de CLIDENT es la fuente de verdad de las citas: tiene los dos
constraints `EXCLUDE` que impiden el doble booking (ADR-008) y es donde la
clínica trabaja. Pero el odontólogo vive su día en el teléfono, y su teléfono
mira Google Calendar. Sin puente, o abre dos agendas o deja de usar una.

El problema no es técnico sino de confidencialidad: **una cita odontológica es un
dato de salud**. "Juan Pérez — endodoncia 26, 3:00 p.m." en un calendario
personal, sincronizado a un teléfono que se presta, se pierde o comparte pantalla
en una reunión, es una filtración de expediente sin que nadie haya sido hackeado.

## Decisión

**Se sincroniza el bloque de tiempo. No se sincroniza el paciente.**

1. **Conexión por odontólogo, no por clínica.** `ConexionGoogleCalendar` cuelga de
   `Membresia` con `@@unique([clinicaId, membresiaId])`. Cada quien conecta su
   propia cuenta o no conecta ninguna; nadie conecta por otro.
2. **El evento no lleva información clínica ni identidad del paciente.** Título
   fijo `"Cita CLIDENT"`, descripción que remite al sistema, ubicación
   `clínica · sucursal`, y el horario. Nada más. El vínculo con la cita real
   viaja en `extendedProperties.private.clidentCitaId`, que sirve para reconciliar
   y no dice nada de nadie.
3. **Calendario propio y alcance mínimo.** El scope es
   `calendar.app.created`: CLIDENT crea un calendario llamado "CLIDENT" dentro de
   la cuenta del odontólogo y **solo puede tocar ese**. No lee ni escribe la
   agenda personal. Si el odontólogo quiere cortar, borra el calendario.
4. **El `refresh_token` se guarda cifrado** con AES-256-GCM
   (`GOOGLE_TOKEN_ENCRYPTION_KEY`, 32 bytes), nunca en claro. La tabla
   `conexiones_google_calendar` además tiene `REVOKE ALL` para `clident_readonly`:
   el rol de reportes **ni siquiera puede leerla**, aparte de RLS.
5. **Google nunca puede bloquear la agenda clínica.**
   `sincronizarCitaGoogleCalendarSeguro()` se traga cualquier error: si Google
   está caído, la cita se crea, se reprograma y se cancela igual. La agenda de
   CLIDENT no depende de un tercero para funcionar.
6. **La sincronización es idempotente.** El `eventId` es un SHA-256 de
   `clinicaId:citaId`, así que un reintento tras una respuesta perdida actualiza
   el mismo evento en vez de duplicarlo; un `409` se resuelve como `update`, y un
   `404` al cancelar se considera éxito.
7. **La integración es opcional y desactivable.** Sin las variables de entorno de
   Google, la función simplemente no existe y el resto del sistema no se entera.

El `state` de OAuth va firmado con HMAC-SHA256 sobre `AUTH_SECRET`, expira a los
10 minutos y está atado a `usuarioId + clinicaId + membresiaId`; se compara con
`timingSafeEqual`. Los mensajes de error se guardan con los tokens `ya29.*`
tachados antes de tocar la base.

## Alternativas descartadas

**Sincronizar el nombre del paciente y el tratamiento.** Es lo que hace casi todo
software de agenda y es lo que la clínica pediría. Descartada: convierte un
teléfono personal en un repositorio de datos de salud fuera del control de la
clínica, sin RLS, sin auditoría y sin forma de revocar lo ya sincronizado. Si
algún día se decide lo contrario, exige consentimiento informado del paciente y
un ADR propio — no es un ajuste de configuración.

**Una sola cuenta de Google por clínica.** Descartada: mezcla las agendas de
todos los odontólogos en un calendario compartido y hace que revocar el acceso de
uno afecte a todos.

**Exportar un feed iCal de solo lectura** (una URL que el odontólogo suscribe).
Más simple y sin OAuth ni tokens. Descartada porque el feed es una URL secreta
permanente: quien la obtenga ve la agenda para siempre, no se puede revocar por
dispositivo, y la actualización en el teléfono llega con horas de retraso.

**Scope `calendar` completo.** Descartada por principio de mínimo privilegio:
daría a CLIDENT lectura y escritura sobre la agenda personal entera del
odontólogo, incluidas sus citas privadas.

**Guardar el `refresh_token` sin cifrar**, confiando en RLS. Descartada: RLS
protege entre clínicas, no protege de un volcado de la base ni de un respaldo mal
guardado. Un token de Google no es un dato de la aplicación: es una llave.

## Consecuencias

**A favor:**
- El odontólogo ve su día en el teléfono sin abrir CLIDENT y sin que su teléfono
  contenga un solo dato de paciente.
- El alcance mínimo hace que el peor caso de una filtración del token sea
  "alguien escribe en un calendario que solo tiene bloques anónimos".
- La agenda clínica queda intacta como fuente de verdad.

**En contra:**
- Una dependencia externa nueva (`googleapis`) y tres variables de entorno más.
  Rompe la regla del stack cerrado de 8 piezas.
- El odontólogo tiene que abrir CLIDENT para saber **de quién** es la cita. Es el
  costo consciente de la decisión, no un defecto.

**Frágil — lo que hay que saber antes de tocarlo:**

> **No hay reintento.** `SincronizacionCitaGoogle` tiene estados `PENDIENTE` y
> `ERROR`, pero **nada los reprocesa**: la sincronización se dispara en línea al
> guardar la cita y, si falla, la fila queda en `ERROR` para siempre. El
> calendario del odontólogo puede quedar desactualizado en silencio. Es
> aceptable porque el calendario es una comodidad y no la fuente de verdad, pero
> **quien construya el reintento debe conservar la idempotencia del punto 6**, y
> quien lea esos estados no debe asumir que reflejan la realidad.

> **`GOOGLE_TOKEN_ENCRYPTION_KEY` no tiene rotación.** Cambiarla invalida todas
> las conexiones existentes: el prefijo `v1.` del formato cifrado está puesto
> para permitir una rotación futura, pero esa rotación no está implementada.

## Costo de revertir

**Bajo.** Se apaga quitando las variables de entorno: sin ellas la integración se
desactiva sola y CLIDENT vuelve a funcionar como antes. Las tablas quedarían sin
uso, y por `CLAUDE.md` §5 se dejan de leer en vez de borrarse.

Lo que **no** se puede deshacer desde CLIDENT son los eventos ya creados en los
calendarios de Google: viven en cuentas ajenas. Como no contienen datos de
paciente, quedan como bloques de tiempo anónimos.

## Deuda de proceso (para que no se repita)

Tres reglas rotas, todas de `CLAUDE.md` §15: dependencia nueva sin ADR,
funcionalidad fuera de las 12 fases del plan y sin autorización registrada, y un
solo PR con dos objetivos independientes (este y el ADR-018) cuando §16 exige un
ciclo por objetivo.

**La implementación se ratifica**: es cuidadosa, y las decisiones de seguridad
—alcance mínimo, token cifrado, cero datos clínicos, `state` firmado— son las
correctas. Lo que falló fue el camino, no el resultado. La causa raíz fue que el
agente que lo implementó nunca leyó `CLAUDE.md`; el Ciclo 23 agrega `AGENTS.md`
para cerrar esa puerta.

**Pendiente de decisión de Carlos:** si esta integración se considera parte del
producto, le corresponde una fila en las fases de `docs/FLUJO-DE-DESARROLLO.md`
§7 y una prueba de integración que hoy no existe.
