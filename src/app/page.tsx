import { redirect } from "next/navigation";

import { requireCtx } from "@/server/auth/context";

/**
 * La raíz ya no es una pantalla propia: con el tablero construido (Fase 11),
 * el destino natural tras autenticarse es el resumen del día. requireCtx()
 * corre igual —revalida la membresía— antes de mandar a ningún lado.
 */
export default async function Home() {
  await requireCtx();
  redirect("/dashboard");
}
