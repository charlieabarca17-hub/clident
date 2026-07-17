import Link from "next/link";

import { crearCitaDesdeFormulario } from "@/server/actions/citas";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso } from "@/server/auth/permissions";
import { FechaCivilSchema, fechaHoyElSalvador } from "@/lib/validation/citas";
import { listarOdontologosAgenda } from "@/server/db/citas";
import { getPacienteParaAgenda, listarPacientes } from "@/server/db/pacientes";

type NuevaCitaSearchParams = Promise<{ fecha?: string; pacienteId?: string; error?: string }>;

export default async function NuevaCitaPage({ searchParams }: { searchParams: NuevaCitaSearchParams }) {
  const parametros = await searchParams;
  const fecha = FechaCivilSchema.safeParse(parametros.fecha).success
    ? parametros.fecha!
    : fechaHoyElSalvador();
  const ctx = await requireCtx();
  requirePermiso(ctx, "agenda:write");
  const [pacientes, odontologos, preseleccion] = await Promise.all([
    listarPacientes(ctx),
    listarOdontologosAgenda(ctx),
    parametros.pacienteId ? getPacienteParaAgenda(ctx, parametros.pacienteId) : null,
  ]);
  const pacienteId = preseleccion?.id ?? "";

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-500">CLIDENT · Agenda</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nueva cita</h1>
          </div>
          <Link href={`/agenda?fecha=${fecha}`} className="rounded-lg border bg-white px-3 py-2 text-sm">Volver a la agenda</Link>
        </header>

        <form action={crearCitaDesdeFormulario} className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
          {parametros.error === "traslape" ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              Ese horario ya no está disponible para el paciente o el odontólogo. Elegí otro horario.
            </p>
          ) : null}
          {parametros.error === "sucursal" ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
              Esta clínica tiene más de una sede. La selección de sede llegará antes de poder agendar en esa configuración.
            </p>
          ) : null}
          <div>
            <label htmlFor="pacienteId" className="block text-sm font-medium">Paciente</label>
            <select id="pacienteId" name="pacienteId" required defaultValue={pacienteId} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="" disabled>Buscar o elegir paciente…</option>
              {pacientes.map((paciente) => (
                <option key={paciente.id} value={paciente.id}>
                  {paciente.apellidos}, {paciente.nombres} · {paciente.telefono}
                </option>
              ))}
            </select>
            {preseleccion ? (
              <p className="mt-2 text-sm text-neutral-600">Paciente preseleccionado desde su expediente: {preseleccion.nombres} {preseleccion.apellidos}.</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="odontologoId" className="block text-sm font-medium">Odontólogo</label>
            <select id="odontologoId" name="odontologoId" required className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="" disabled>Elegí un odontólogo…</option>
              {odontologos.map((odontologo) => (
                <option key={odontologo.id} value={odontologo.id}>{odontologo.nombre}</option>
              ))}
            </select>
            {odontologos.length === 0 ? <p className="mt-2 text-sm text-red-700">No hay odontólogos activos para esta clínica.</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium">Fecha
              <input name="fecha" type="date" required defaultValue={fecha} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <label className="block text-sm font-medium">Hora
              <input name="hora" type="time" required defaultValue="09:00" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <label className="block text-sm font-medium">Duración
              <select name="duracionMinutos" defaultValue="30" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">1 hora</option>
                <option value="90">1 h 30 min</option>
                <option value="120">2 horas</option>
              </select>
            </label>
          </div>

          <label className="block text-sm font-medium">Motivo de la cita
            <input name="motivo" maxLength={240} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" placeholder="Ej.: control, limpieza o valoración" />
          </label>
          <label className="block text-sm font-medium">Notas administrativas
            <textarea name="notasAdministrativas" maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" placeholder="Solo coordinación de la cita; la información clínica pertenece al expediente." />
          </label>

          <div className="flex justify-end gap-3 border-t pt-5">
            <Link href={`/agenda?fecha=${fecha}`} className="rounded-lg border px-4 py-2 text-sm font-medium">Cancelar</Link>
            <button disabled={odontologos.length === 0 || pacientes.length === 0} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300">
              Guardar cita
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
