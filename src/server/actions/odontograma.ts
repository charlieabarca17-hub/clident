"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AnularEventoOdontogramaSchema,
  RegistrarCondicionSchema,
} from "@/lib/validation/odontograma";
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
  anularEventoOdontograma,
  registrarCondicion,
} from "@/server/db/odontograma";

function texto(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

/** Los campos que se le devuelven a la pantalla si hay que corregir algo. */
const CAMPOS_CONDICION = ["fdi", "superficie", "condicion", "ocurridoEn", "diagnosticoId"] as const;

export async function registrarCondicionDesdeFormulario(
  _estadoPrevio: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");

  const escrito = valoresDelFormulario(formData, CAMPOS_CONDICION);
  const analisis = RegistrarCondicionSchema.safeParse({
    pacienteId: texto(formData, "pacienteId"),
    fdi: texto(formData, "fdi"),
    superficie: texto(formData, "superficie"),
    condicion: texto(formData, "condicion"),
    ocurridoEn: texto(formData, "ocurridoEn"),
    diagnosticoId: texto(formData, "diagnosticoId"),
  });
  if (!analisis.success) {
    return errorDeFormulario(mensajesDeError(analisis.error), escrito);
  }

  const datos = analisis.data;
  let evento: Awaited<ReturnType<typeof registrarCondicion>>;
  try {
    // La transacción hace la escritura atómica. NO garantiza que reintentar no
    // duplique: si el COMMIT ocurrió y la respuesta se perdió, el evento quedó
    // registrado y acá igual se ve un error. Por eso el mensaje de resultado
    // incierto manda revisar la historia antes de volver a intentar.
    evento = await registrarCondicion(ctx, datos);
  } catch (error) {
    // Una regla clínica se muestra tal cual; lo demás, sin detalles y sin invitar
    // a reintentar a ciegas. A propósito no se registra el contenido del
    // formulario: acá viajan datos clínicos y no tienen por qué ir a un log.
    return errorAlGuardar(error, escrito);
  }
  if (!evento) return errorDeFormulario([MENSAJE_NO_DISPONIBLE], escrito);

  revalidatePath(`/pacientes/${datos.pacienteId}/odontograma`);
  // Fuera del try: `redirect` lanza una señal interna de Next y un catch la
  // tragaría, dejando al profesional sin saber si se guardó.
  redirect(`/pacientes/${datos.pacienteId}/odontograma`);
}

export async function anularEventoOdontogramaDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const datos = AnularEventoOdontogramaSchema.parse({
    pacienteId: texto(formData, "pacienteId"),
    eventoId: texto(formData, "eventoId"),
    motivoAnulacion: texto(formData, "motivoAnulacion"),
  });
  const evento = await anularEventoOdontograma(ctx, datos);
  revalidatePath(`/pacientes/${datos.pacienteId}/odontograma`);
  redirect(
    evento
      ? `/pacientes/${datos.pacienteId}/odontograma`
      : `/pacientes/${datos.pacienteId}/odontograma?estado=no-disponible`,
  );
}
