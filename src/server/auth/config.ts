import "server-only";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { leerEntornoAuth } from "@/server/env";
import { validarMembresiaActiva } from "./membresias";
import { autenticarCredenciales } from "./usuarios";

const env = leerEntornoAuth();

export const { handlers, auth, signIn, signOut, unstable_update: actualizarSesion } = NextAuth({
  secret: env.AUTH_SECRET,
  // Vercel termina TLS en su proxy y entrega el host original al runtime. No copiar esta
  // opción a un despliegue self-hosted sin validar antes los encabezados de confianza.
  trustHost: true,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { correo: {}, password: {} },
      authorize: autenticarCredenciales,
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) token.usuarioId = user.id;
      if (trigger === "update" && typeof token.usuarioId === "string") {
        const clinicaId = typeof session?.clinicaId === "string" ? session.clinicaId : null;
        const valida = clinicaId
          ? await validarMembresiaActiva(token.usuarioId, clinicaId)
          : null;
        token.clinicaId = valida?.clinicaId;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.usuarioId === "string") session.user.id = token.usuarioId;
      session.clinicaId = typeof token.clinicaId === "string" ? token.clinicaId : undefined;
      return session;
    },
  },
});
