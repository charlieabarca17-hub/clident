/**
 * El día civil de la clínica. "$hoy se calcula en src/lib/ con
 * America/El_Salvador, en un solo lugar" (ARQUITECTURA §12.6): las cuotas
 * vencen días civiles, no instantes, y calcular "hoy" en UTC haría exigible
 * la cuota del 1.º a las 6 p.m. del 30.
 */

const ZONA_HORARIA_CLINICA = "America/El_Salvador";

/** Fecha civil de hoy en El Salvador, como "YYYY-MM-DD". */
export function hoyElSalvador(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA_CLINICA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/**
 * Los instantes que abren y cierran un día civil salvadoreño. El Salvador es
 * UTC-6 sin horario de verano, así que el desfase es fijo — pero se escribe
 * acá una sola vez para que ningún módulo lo reinvente con `new Date()` local.
 */
export function limitesDelDia(fechaCivil: string): { inicio: Date; fin: Date } {
  const inicio = new Date(`${fechaCivil}T00:00:00-06:00`);
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicio, fin };
}

/**
 * Genera las fechas de un calendario de cuotas mensuales a partir de la
 * primera. Si el día no existe en un mes (31 de febrero), se usa el último
 * día de ese mes. Devuelve strings "YYYY-MM-DD": son días civiles, no instantes.
 */
export function generarFechasCuotasMensuales(primeraFecha: string, cuotas: number): string[] {
  const [anio, mes, dia] = primeraFecha.split("-").map(Number);
  const fechas: string[] = [];
  for (let indice = 0; indice < cuotas; indice += 1) {
    const mesObjetivo = mes - 1 + indice;
    const anioReal = anio + Math.floor(mesObjetivo / 12);
    const mesReal = mesObjetivo % 12;
    // Día 0 del mes siguiente = último día del mes objetivo.
    const ultimoDia = new Date(Date.UTC(anioReal, mesReal + 1, 0)).getUTCDate();
    const diaReal = Math.min(dia, ultimoDia);
    const fecha = new Date(Date.UTC(anioReal, mesReal, diaReal));
    fechas.push(fecha.toISOString().slice(0, 10));
  }
  return fechas;
}
