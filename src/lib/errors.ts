/** Error de dominio que las Server Actions pueden mostrar sin exponer SQL ni IDs ajenos. */
export class ErrorAgendaTraslape extends Error {
  readonly code = "AGENDA_TRASLAPE";

  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorAgendaTraslape";
  }
}

/** La agenda no puede inventar una sede cuando la clínica ya tiene más de una. */
export class ErrorAgendaSucursal extends Error {
  readonly code = "AGENDA_SUCURSAL_REQUERIDA";

  constructor() {
    super("Elegí una sede antes de agendar la cita.");
    this.name = "ErrorAgendaSucursal";
  }
}

type ErrorConCausa = { cause?: unknown; code?: unknown; constraint?: unknown; meta?: unknown; message?: unknown };

function esObjeto(valor: unknown): valor is ErrorConCausa {
  return typeof valor === "object" && valor !== null;
}

/** Prisma/pg pueden poner SQLSTATE y constraint en capas distintas según el adaptador. */
export function esExclusionDeCita(error: unknown, constraint: string): boolean {
  let actual: unknown = error;
  for (let profundidad = 0; profundidad < 3; profundidad += 1) {
    if (!esObjeto(actual)) return false;
    const meta = esObjeto(actual.meta) ? actual.meta : undefined;
    const codigo = actual.code ?? meta?.code;
    const nombre = actual.constraint ?? meta?.constraint;
    const mensaje = [actual.message, meta?.message].filter(Boolean).join(" ");
    if (codigo === "23P01" && (nombre === constraint || mensaje.includes(constraint))) return true;
    actual = actual.cause;
  }
  return false;
}
