"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CrearPacienteSchema } from "@/lib/validation/pacientes";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import { crearPaciente as crearPacienteEnDb } from "@/server/db/pacientes";

export async function crearPaciente(input: unknown) {
  const ctx = await requireCtx();
  requirePermiso(ctx, "paciente:write");
  const datos = CrearPacienteSchema.parse(input);
  const paciente = await crearPacienteEnDb(ctx, datos);
  revalidatePath("/pacientes");
  return paciente;
}

function texto(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

function datosFormulario(formData: FormData) {
  const responsable = {
    nombre: texto(formData, "responsableNombre"),
    tipoDocumento: texto(formData, "responsableTipoDocumento"),
    numeroDocumento: texto(formData, "responsableNumeroDocumento"),
    telefono: texto(formData, "responsableTelefono"),
    parentesco: texto(formData, "responsableParentesco"),
  };
  const tieneResponsable = Object.values(responsable).some(Boolean);

  return {
    nombres: texto(formData, "nombres"),
    apellidos: texto(formData, "apellidos"),
    fechaNacimiento: texto(formData, "fechaNacimiento"),
    dui: texto(formData, "dui"),
    telefono: texto(formData, "telefono"),
    correo: texto(formData, "correo"),
    direccion: texto(formData, "direccion"),
    responsable: tieneResponsable ? responsable : null,
    contactoEmergencia: {
      nombre: texto(formData, "contactoEmergenciaNombre"),
      telefono: texto(formData, "contactoEmergenciaTelefono"),
    },
  };
}

/** Ruta de alta HTML: autentica antes de leer y validar datos enviados por el navegador. */
export async function crearPacienteDesdeFormulario(formData: FormData): Promise<never> {
  const ctx = await requireCtx();
  requirePermiso(ctx, "paciente:write");
  const datos = CrearPacienteSchema.parse(datosFormulario(formData));
  const paciente = await crearPacienteEnDb(ctx, datos);
  revalidatePath("/pacientes");
  redirect(`/pacientes/${paciente.id}`);
}
