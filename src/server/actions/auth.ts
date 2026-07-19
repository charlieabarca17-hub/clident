"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { CredencialesSchema } from "@/server/auth/credenciales";
import { actualizarSesion, signIn, signOut } from "@/server/auth/config";
import { requireAuth } from "@/server/auth/context";
import { establecerPasswordConInvitacion } from "@/server/auth/invitaciones";
import { validarMembresiaActiva } from "@/server/auth/membresias";

const PasswordSchema = z.object({
  token: z.string().min(32).max(200),
  password: z.string().min(12).max(200),
  confirmacion: z.string(),
}).refine(({ password, confirmacion }) => password === confirmacion);

export async function iniciarSesion(formData: FormData): Promise<void> {
  const datos = CredencialesSchema.safeParse(Object.fromEntries(formData));
  if (!datos.success) redirect("/login?error=credenciales");
  try {
    await signIn("credentials", { ...datos.data, redirectTo: "/elegir-clinica" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=credenciales");
    throw error;
  }
}

export async function elegirClinica(formData: FormData): Promise<void> {
  const auth = await requireAuth();
  const clinicaId = z.string().min(1).max(100).safeParse(formData.get("clinicaId"));
  if (!clinicaId.success) redirect("/elegir-clinica?error=seleccion");
  const membresia = await validarMembresiaActiva(auth.usuarioId, clinicaId.data);
  if (!membresia) redirect("/elegir-clinica?error=seleccion");
  await actualizarSesion({ clinicaId: membresia.clinicaId });
  redirect("/");
}

export async function establecerPassword(formData: FormData): Promise<void> {
  const datos = PasswordSchema.safeParse(Object.fromEntries(formData));
  if (!datos.success) {
    const token = formData.get("token");
    const tokenSeguro = typeof token === "string" && /^[A-Za-z0-9_-]{32,200}$/.test(token)
      ? token
      : "";
    const ruta = tokenSeguro
      ? `/establecer-contrasena/${encodeURIComponent(tokenSeguro)}`
      : "/establecer-contrasena";
    redirect(`${ruta}?error=password`);
  }
  const usuario = await establecerPasswordConInvitacion(datos.data.token, datos.data.password);
  if (!usuario) redirect("/establecer-contrasena?error=token");
  await signIn("credentials", {
    correo: usuario.correo,
    password: datos.data.password,
    redirectTo: "/elegir-clinica",
  });
}

export async function cerrarSesion(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
