"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AnularProcedimientoSchema,
  EditarNotaSchema,
  EnmendarNotaSchema,
  RealizarProcedimientoSchema,
} from "@/lib/validation/procedimientos";
import { esErrorReglaClinica } from "@/lib/errors";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import {
  type EstadoFormulario,
  errorAlGuardar,
  MENSAJE_NO_DISPONIBLE,
  errorDeFormulario,
  mensajesDeError,
  valoresDelFormulario,
} from "@/lib/formulario";
import {
  anularProcedimiento,
  editarNotaClinica,
  enmendarNotaClinica,
  realizarProcedimiento,
} from "@/server/db/procedimientos";

function texto(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

const MAX_FILAS_DIENTES = 10;

function dientesDelFormulario(formData: FormData) {
  const dientes: Array<{ fdi: string; superficie: string }> = [];
  for (let fila = 0; fila < MAX_FILAS_DIENTES; fila += 1) {
    const fdi = texto(formData, `diente-${fila}`);
    const superficie = texto(formData, `superficie-${fila}`);
    if (fdi) dientes.push({ fdi, superficie: superficie || "COMPLETO" });
  }
  return dientes;
}

function ruta(pacienteId: string): string {
  return `/pacientes/${pacienteId}/procedimientos`;
}

/**
 * Los campos que se le devuelven a la pantalla si hay que corregir algo. Incluye
 * las filas de piezas para que el profesional no tenga que volver a elegirlas, y
 * sobre todo `notasClinicas`: es lo más caro de volver a escribir.
 */
const CAMPOS_PROCEDIMIENTO = [
  "planItemId",
  "realizadoEn",
  "notasClinicas",
  "condicionResultante",
  ...Array.from({ length: MAX_FILAS_DIENTES }, (_, fila) => `diente-${fila}`),
  ...Array.from({ length: MAX_FILAS_DIENTES }, (_, fila) => `superficie-${fila}`),
] as const;

export async function realizarProcedimientoDesdeFormulario(
  _estadoPrevio: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");

  const escrito = valoresDelFormulario(formData, CAMPOS_PROCEDIMIENTO);
  const analisis = RealizarProcedimientoSchema.safeParse({
    pacienteId: texto(formData, "pacienteId"),
    planItemId: texto(formData, "planItemId"),
    realizadoEn: texto(formData, "realizadoEn"),
    notasClinicas: texto(formData, "notasClinicas"),
    condicionResultante: texto(formData, "condicionResultante") || null,
    dientes: dientesDelFormulario(formData),
  });
  if (!analisis.success) {
    return errorDeFormulario(mensajesDeError(analisis.error), escrito);
  }

  const datos = analisis.data;
  let procedimiento: Awaited<ReturnType<typeof realizarProcedimiento>>;
  try {
    // La transacción hace la escritura atómica. NO garantiza que reintentar no
    // duplique: si el COMMIT ocurrió y la respuesta se perdió, el procedimiento
    // quedó registrado y acá igual se ve un error. Por eso el mensaje de resultado
    // incierto manda revisar la historia antes de volver a intentar.
    procedimiento = await realizarProcedimiento(ctx, datos);
  } catch (error) {
    // Una regla clínica se muestra tal cual; lo demás, sin detalles y sin invitar
    // a reintentar a ciegas. La nota clínica no va a ningún log.
    return errorAlGuardar(error, escrito);
  }
  if (!procedimiento) return errorDeFormulario([MENSAJE_NO_DISPONIBLE], escrito);

  revalidatePath(ruta(datos.pacienteId));
  // Fuera del try: `redirect` lanza una señal interna de Next que un catch
  // tragaría, dejando al profesional sin saber si se guardó.
  redirect(ruta(datos.pacienteId));
}

export async function editarNotaDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = EditarNotaSchema.parse({
    procedimientoId: texto(formData, "procedimientoId"),
    notasClinicas: texto(formData, "notasClinicas"),
  });
  const procedimiento = await editarNotaClinica(ctx, datos.procedimientoId, datos.notasClinicas);
  revalidatePath(ruta(pacienteId));
  redirect(procedimiento ? ruta(pacienteId) : `${ruta(pacienteId)}?estado=no-disponible`);
}

export async function enmendarNotaDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = EnmendarNotaSchema.parse({
    procedimientoId: texto(formData, "procedimientoId"),
    textoNuevo: texto(formData, "textoNuevo"),
    motivo: texto(formData, "motivo"),
  });
  const procedimiento = await enmendarNotaClinica(ctx, datos);
  revalidatePath(ruta(pacienteId));
  redirect(procedimiento ? ruta(pacienteId) : `${ruta(pacienteId)}?estado=no-disponible`);
}

export async function anularProcedimientoDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const pacienteId = texto(formData, "pacienteId");
  const datos = AnularProcedimientoSchema.parse({
    procedimientoId: texto(formData, "procedimientoId"),
    motivoAnulacion: texto(formData, "motivoAnulacion"),
  });
  let procedimiento: Awaited<ReturnType<typeof anularProcedimiento>> = null;
  let bloqueadoPorCobro = false;
  try {
    procedimiento = await anularProcedimiento(ctx, datos.procedimientoId, datos.motivoAnulacion);
  } catch (error) {
    // La única regla clínica de la anulación es la del cobro vigente (§9). Viaja
    // como un código fijo, nunca como texto libre en la URL.
    if (!esErrorReglaClinica(error)) throw error;
    bloqueadoPorCobro = true;
  }
  revalidatePath(ruta(pacienteId));
  // Fuera del try: `redirect` lanza una señal interna de Next que un catch tragaría.
  if (bloqueadoPorCobro) redirect(`${ruta(pacienteId)}?estado=cobrado`);
  redirect(procedimiento ? ruta(pacienteId) : `${ruta(pacienteId)}?estado=no-disponible`);
}
