"use client";

import type { ChangeEvent } from "react";

import { normalizarDui } from "@/lib/dui";

function formatearMientrasEscribe(evento: ChangeEvent<HTMLInputElement>): void {
  const soloDigitos = evento.currentTarget.value.replace(/\D/g, "").slice(0, 9);
  evento.currentTarget.value = normalizarDui(soloDigitos);
}

/** Campo de UX: el servidor normaliza y valida de nuevo antes de persistir. */
export function DuiInput() {
  return (
    <input
      name="dui"
      inputMode="numeric"
      pattern="[0-9]{8}-?[0-9]"
      maxLength={10}
      placeholder="00000000-0"
      className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
      onChange={formatearMientrasEscribe}
    />
  );
}
