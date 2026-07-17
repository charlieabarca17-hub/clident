"use client";

import { useEffect, useRef } from "react";

export function AutoseleccionClinica({
  clinicaId,
  seleccionar,
}: {
  clinicaId: string;
  seleccionar: (formData: FormData) => void | Promise<void>;
}) {
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formulario.current?.requestSubmit();
  }, []);

  return (
    <form action={seleccionar} ref={formulario} className="mt-6">
      <input type="hidden" name="clinicaId" value={clinicaId} />
      <p role="status" className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-600">
        Preparando tu clínica…
      </p>
      <button className="mt-4 w-full rounded-lg border px-4 py-2 text-sm font-medium">
        Continuar
      </button>
    </form>
  );
}
