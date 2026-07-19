import "server-only";

/**
 * Freno de fuerza bruta en el login (Fase 12).
 *
 * **Límite declarado: es EN MEMORIA, por instancia.** En Vercel cada instancia
 * serverless tiene su propio contador, así que un atacante distribuido puede
 * multiplicar los intentos por la cantidad de instancias vivas. No es un WAF.
 *
 * Aun así vale la pena: el ataque realista contra una clínica no es una
 * botnet, es alguien probando contraseñas contra un correo conocido — y eso
 * lo frena. La alternativa correcta (contador en PostgreSQL) escribiría en la
 * base en cada intento fallido, incluidos los de un ataque, que es
 * exactamente lo que un atacante quiere. Si algún día hace falta más, el
 * lugar es un rate limit en el borde, no acá.
 *
 * Se cuenta por CORREO, no por IP: detrás de un NAT de clínica todos comparten
 * IP, y bloquear por IP dejaría fuera a la recepción entera por un tecleo malo.
 */

const MAX_INTENTOS = 8;
const VENTANA_MS = 15 * 60 * 1000;
const LIMPIEZA_CADA = 500;

type Registro = { intentos: number; expiraEn: number };

const intentosPorCorreo = new Map<string, Registro>();
let operacionesDesdeLimpieza = 0;

function limpiarVencidos(ahora: number): void {
  operacionesDesdeLimpieza += 1;
  if (operacionesDesdeLimpieza < LIMPIEZA_CADA) return;
  operacionesDesdeLimpieza = 0;
  for (const [clave, registro] of intentosPorCorreo) {
    if (registro.expiraEn <= ahora) intentosPorCorreo.delete(clave);
  }
}

function clave(correo: string): string {
  return correo.trim().toLowerCase();
}

/** ¿Está bloqueado este correo ahora mismo? */
export function estaBloqueado(correo: string, ahora = Date.now()): boolean {
  const registro = intentosPorCorreo.get(clave(correo));
  if (!registro) return false;
  if (registro.expiraEn <= ahora) {
    intentosPorCorreo.delete(clave(correo));
    return false;
  }
  return registro.intentos >= MAX_INTENTOS;
}

/** Registra un intento fallido. Devuelve true si a partir de ahora está bloqueado. */
export function registrarIntentoFallido(correo: string, ahora = Date.now()): boolean {
  limpiarVencidos(ahora);
  const id = clave(correo);
  const registro = intentosPorCorreo.get(id);
  if (!registro || registro.expiraEn <= ahora) {
    intentosPorCorreo.set(id, { intentos: 1, expiraEn: ahora + VENTANA_MS });
    return false;
  }
  registro.intentos += 1;
  return registro.intentos >= MAX_INTENTOS;
}

/** Un login exitoso limpia el contador: el usuario legítimo no arrastra castigo. */
export function limpiarIntentos(correo: string): void {
  intentosPorCorreo.delete(clave(correo));
}

/** Solo para pruebas: deja el registro en blanco. */
export function reiniciarRateLimit(): void {
  intentosPorCorreo.clear();
  operacionesDesdeLimpieza = 0;
}

export const LIMITES_LOGIN = { MAX_INTENTOS, VENTANA_MS } as const;
