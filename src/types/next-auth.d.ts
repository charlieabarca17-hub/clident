import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string };
    clinicaId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    usuarioId?: string;
    clinicaId?: string;
  }
}
