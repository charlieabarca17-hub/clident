import Link from "next/link";

import { crearPacienteDesdeFormulario } from "@/server/actions/pacientes";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";

export default async function NuevoPacientePage() {
  const ctx = await requireCtx();
  requirePermiso(ctx, "paciente:write");

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-500">CLIDENT · Pacientes</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nuevo paciente</h1>
          </div>
          <Link href="/pacientes" className="rounded-lg border bg-white px-3 py-2 text-sm">Volver a pacientes</Link>
        </header>

        <form action={crearPacienteDesdeFormulario} className="space-y-6 rounded-2xl border bg-white p-5 shadow-sm">
          <section className="space-y-4">
            <div>
              <h2 className="font-semibold">Datos del paciente</h2>
              <p className="mt-1 text-sm text-neutral-600">Los campos marcados con * son obligatorios.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Nombres *
                <input name="nombres" required maxLength={120} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" autoComplete="given-name" />
              </label>
              <label className="block text-sm font-medium">Apellidos *
                <input name="apellidos" required maxLength={120} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" autoComplete="family-name" />
              </label>
              <label className="block text-sm font-medium">Fecha de nacimiento *
                <input name="fechaNacimiento" type="date" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-medium">DUI
                <input name="dui" inputMode="numeric" pattern="[0-9]{8}-[0-9]" maxLength={10} placeholder="00000000-0" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-medium">Teléfono *
                <input name="telefono" required maxLength={30} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" autoComplete="tel" />
              </label>
              <label className="block text-sm font-medium">Correo
                <input name="correo" type="email" maxLength={254} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" autoComplete="email" />
              </label>
            </div>
            <label className="block text-sm font-medium">Dirección
              <textarea name="direccion" maxLength={500} rows={2} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" autoComplete="street-address" />
            </label>
          </section>

          <section className="space-y-4 border-t pt-6">
            <div>
              <h2 className="font-semibold">Contacto de emergencia</h2>
              <p className="mt-1 text-sm text-neutral-600">Siempre se registra, aun para pacientes adultos.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Nombre completo *
                <input name="contactoEmergenciaNombre" required maxLength={160} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-medium">Teléfono *
                <input name="contactoEmergenciaTelefono" required maxLength={30} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
            </div>
          </section>

          <section className="space-y-4 border-t pt-6">
            <div>
              <h2 className="font-semibold">Responsable</h2>
              <p className="mt-1 text-sm text-neutral-600">Obligatorio y completo si el paciente es menor de 18 años.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Nombre completo
                <input name="responsableNombre" maxLength={160} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-medium">Parentesco
                <input name="responsableParentesco" maxLength={80} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" placeholder="Ej.: madre, padre o tutor" />
              </label>
              <label className="block text-sm font-medium">Tipo de documento
                <select name="responsableTipoDocumento" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" defaultValue="">
                  <option value="">Elegí un tipo…</option>
                  <option value="DUI">DUI</option>
                  <option value="PASAPORTE">Pasaporte</option>
                  <option value="CARNET_RESIDENTE">Carnet de residente</option>
                </select>
              </label>
              <label className="block text-sm font-medium">Número de documento
                <input name="responsableNumeroDocumento" maxLength={80} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-medium">Teléfono
                <input name="responsableTelefono" maxLength={30} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
              </label>
            </div>
          </section>

          <div className="flex justify-end gap-3 border-t pt-5">
            <Link href="/pacientes" className="rounded-lg border px-4 py-2 text-sm font-medium">Cancelar</Link>
            <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Crear paciente</button>
          </div>
        </form>
      </section>
    </main>
  );
}
