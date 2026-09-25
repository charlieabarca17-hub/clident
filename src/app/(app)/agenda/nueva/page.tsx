import Link from "next/link";

import { crearCitaDesdeFormulario } from "@/server/actions/citas";
import { requireCtx } from "@/server/auth/context";
import { requirePermiso, tienePermiso } from "@/server/auth/permissions";
import { FechaCivilSchema, fechaHoyElSalvador } from "@/lib/validation/citas";
import { VOLVER_A_AGENDA, prepararSeleccionPaciente } from "@/lib/agenda";
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
  // Las opciones y el valor seleccionado salen juntos y coherentes: el `<select>`
  // nunca recibe un valor que no exista entre sus opciones (`src/lib/agenda.ts`).
  const { opciones: opcionesPaciente, valorSeleccionado: pacienteSeleccionadoId } =
    prepararSeleccionPaciente(pacientes, preseleccion);
  // Alta de paciente sin salir del flujo de la cita: se crea y se vuelve acá con
  // el paciente preseleccionado y la misma fecha (`destinoTrasCrearPaciente`).
  const puedeCrearPaciente = tienePermiso(ctx.roles, "paciente:write");
  const rutaPacienteNuevo = `/pacientes/nuevo?${new URLSearchParams({ volver: VOLVER_A_AGENDA, fecha }).toString()}`;

  return (
    <main className="min-h-full bg-background p-5 sm:p-8">
      <section className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">CLIDENT · Agenda</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nueva cita</h1>
          </div>
          <Link href={`/agenda?fecha=${fecha}`} className="rounded-lg border bg-card px-3 py-2 text-sm">Volver a la agenda</Link>
        </header>

        <form action={crearCitaDesdeFormulario} className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
          {parametros.error === "traslape" ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              Ese horario ya no está disponible para el paciente o el odontólogo. Elegí otro horario.
            </p>
          ) : null}
          {parametros.error === "sucursal" ? (
            <p className="rounded-lg border border-advertencia/30 bg-advertencia-suave px-3 py-2 text-sm text-foreground" role="alert">
              Esta clínica tiene más de una sede. La selección de sede llegará antes de poder agendar en esa configuración.
            </p>
          ) : null}
          <fieldset>
            <legend className="text-sm font-medium">¿Para quién es la cita?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <span
                aria-current="true"
                className="rounded-lg border border-primary bg-primary/10 px-3 py-2 text-sm font-medium"
              >
                Paciente existente
                <span className="block text-xs font-normal text-muted-foreground">Elegilo de la lista de abajo.</span>
              </span>
              {puedeCrearPaciente ? (
                <Link
                  href={rutaPacienteNuevo}
                  className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Paciente nuevo →
                  <span className="block text-xs font-normal text-muted-foreground">
                    Lo registrás y volvés a esta cita con él ya elegido.
                  </span>
                </Link>
              ) : null}
            </div>
          </fieldset>

          <div>
            <label htmlFor="pacienteId" className="block text-sm font-medium">Paciente</label>
            <select id="pacienteId" name="pacienteId" required defaultValue={pacienteSeleccionadoId} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="" disabled>Buscar o elegir paciente…</option>
              {opcionesPaciente.map((paciente) => (
                <option key={paciente.id} value={paciente.id}>
                  {paciente.apellidos}, {paciente.nombres} · {paciente.telefono}
                </option>
              ))}
            </select>
            {preseleccion ? (
              <p className="mt-2 text-sm text-muted-foreground">Paciente preseleccionado desde su expediente: {preseleccion.nombres} {preseleccion.apellidos}.</p>
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
            {odontologos.length === 0 ? <p className="mt-2 text-sm text-destructive">No hay odontólogos activos para esta clínica.</p> : null}
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
            <button disabled={odontologos.length === 0 || opcionesPaciente.length === 0} className="rounded-lg bg-primary transition-colors hover:bg-rosa-hover px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
              Guardar cita
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
