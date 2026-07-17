"use server";

import { revalidatePath } from "next/cache";

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
