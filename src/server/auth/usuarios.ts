import "server-only";

import argon2 from "argon2";

import { CredencialesSchema } from "./credenciales";
import { db } from "@/server/db/client";

// Igualamos el costo de una credencial inexistente al de una existente: el mensaje de
// error ya es idéntico y este hash evita que el tiempo revele qué correo está registrado.
const HASH_DUMMY = "$argon2id$v=19$m=65536,t=3,p=4$dbQB04FD1bDmeboqm7klXQ$rB85Fp4N49ld4PLB/cpK8F76WhtZfXEBlLhBVq0cXSM";

export async function autenticarCredenciales(entrada: unknown) {
  const resultado = CredencialesSchema.safeParse(entrada);
  if (!resultado.success) return null;

  const usuario = await db.usuario.findUnique({
    where: { correo: resultado.data.correo },
    select: { id: true, correo: true, nombre: true, passwordHash: true },
  });
  const valido = await argon2.verify(usuario?.passwordHash ?? HASH_DUMMY, resultado.data.password);
  if (!usuario?.passwordHash || !valido) return null;
  return { id: usuario.id, email: usuario.correo, name: usuario.nombre };
}
