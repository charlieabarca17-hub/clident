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
  anularEventoOdontograma,
  registrarCondicion,
} from "@/server/db/odontograma";

function texto(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

export async function registrarCondicionDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "clinico:write");
  const datos = RegistrarCondicionSchema.parse({
    pacienteId: texto(formData, "pacienteId"),
    fdi: texto(formData, "fdi"),
    superficie: texto(formData, "superficie"),
    condicion: texto(formData, "condicion"),
    ocurridoEn: texto(formData, "ocurridoEn"),
    diagnosticoId: texto(formData, "diagnosticoId"),
  });
  const evento = await registrarCondicion(ctx, datos);
  revalidatePath(`/pacientes/${datos.pacienteId}/odontograma`);
  redirect(
    evento
      ? `/pacientes/${datos.pacienteId}/odontograma`
      : `/pacientes/${datos.pacienteId}/odontograma?estado=no-disponible`,
  );
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
