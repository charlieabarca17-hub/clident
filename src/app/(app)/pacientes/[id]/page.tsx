import Link from "next/link";
import { notFound } from "next/navigation";

import { requireCtx } from "@/server/auth/context";
import { tienePermiso } from "@/server/auth/permissions";
import { listarCitasPaciente } from "@/server/db/citas";
import { getPacienteAdministrativo, getPacienteDetalle } from "@/server/db/pacientes";

type PacientePageProps = { params: Promise<{ id: string }> };

function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${fecha}T00:00:00-06:00`));
}

function fechaHora(fecha: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(fecha));
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{etiqueta}</dt>
      <dd className="mt-1 text-sm text-neutral-900">{valor || "—"}</dd>
    </div>
  );
}

export default async function PacienteExpedientePage({ params }: PacientePageProps) {
  const { id } = await params;
  const ctx = await requireCtx();
  const paciente = await getPacienteAdministrativo(ctx, id);
  if (!paciente) notFound();

  const puedeVerPii = tienePermiso(ctx.roles, "paciente:read_pii");
  const [citas, detallePii] = await Promise.all([
    listarCitasPaciente(ctx, id),
    puedeVerPii ? getPacienteDetalle(ctx, id) : Promise.resolve(null),
  ]);

  return (
    <main className="min-h-full bg-neutral-50 p-5 sm:p-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link href="/pacientes" className="text-sm text-neutral-600 underline-offset-4 hover:underline">← Pacientes</Link>
              <p className="mt-4 text-sm font-medium text-neutral-500">CLIDENT · Expediente</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{paciente.nombres} {paciente.apellidos}</h1>
              <p className="mt-1 text-sm text-neutral-600">Nacimiento: {fechaLarga(paciente.fechaNacimiento)} · Teléfono: {paciente.telefono}</p>
            </div>
            {tienePermiso(ctx.roles, "agenda:write") ? (
              <Link href={`/agenda/nueva?pacienteId=${encodeURIComponent(paciente.id)}`} className="rounded-lg bg-neutral-900 px-4 py-2 text-center text-sm font-medium text-white">
                + Agendar cita
              </Link>
            ) : null}
          </div>
          <nav className="mt-5 flex flex-wrap gap-2 border-t pt-4 text-sm" aria-label="Secciones del expediente">
            <a href="#resumen" className="rounded-full bg-neutral-900 px-3 py-1.5 font-medium text-white">Resumen</a>
            <a href="#agenda" className="rounded-full border px-3 py-1.5 font-medium">Agenda</a>
            <span className="rounded-full border border-dashed px-3 py-1.5 text-neutral-500">Historial clínico · Próximamente</span>
            <span className="rounded-full border border-dashed px-3 py-1.5 text-neutral-500">Odontograma · Próximamente</span>
            <span className="rounded-full border border-dashed px-3 py-1.5 text-neutral-500">Planes y caja · Próximamente</span>
          </nav>
        </header>

        <section id="resumen" className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Datos administrativos</h2>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <Dato etiqueta="Teléfono" valor={paciente.telefono} />
              <Dato etiqueta="Correo" valor={paciente.correo} />
              <Dato etiqueta="Dirección" valor={paciente.direccion} />
              <Dato etiqueta="DUI" valor={detallePii?.dui ?? paciente.duiEnmascarado} />
            </dl>
            {!puedeVerPii ? <p className="mt-5 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">El DUI se muestra enmascarado según tu rol.</p> : null}
          </article>

          <article className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Contactos</h2>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <Dato etiqueta="Emergencia" valor={paciente.contactoEmergencia.nombre} />
              <Dato etiqueta="Teléfono de emergencia" valor={paciente.contactoEmergencia.telefono} />
              <Dato etiqueta="Responsable" valor={paciente.responsable?.nombre} />
              <Dato etiqueta="Parentesco" valor={paciente.responsable?.parentesco} />
              <Dato etiqueta="Teléfono de responsable" valor={paciente.responsable?.telefono} />
              {detallePii?.responsable ? <Dato etiqueta="Documento de responsable" valor={`${detallePii.responsable.tipoDocumento ?? ""} ${detallePii.responsable.numeroDocumento ?? ""}`.trim()} /> : null}
            </dl>
          </article>
        </section>

        <section id="agenda" className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <header className="flex items-center justify-between gap-4 border-b p-5">
            <div>
              <h2 className="text-lg font-semibold">Agenda del paciente</h2>
              <p className="mt-1 text-sm text-neutral-600">Últimas 20 citas de esta clínica.</p>
            </div>
            {tienePermiso(ctx.roles, "agenda:write") ? <Link href={`/agenda/nueva?pacienteId=${encodeURIComponent(paciente.id)}`} className="rounded-lg border px-3 py-2 text-sm font-medium">Nueva cita</Link> : null}
          </header>
          {citas.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-600">Todavía no hay citas registradas para este paciente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Fecha y hora</th>
                    <th className="px-5 py-3 font-medium">Odontólogo</th>
                    <th className="px-5 py-3 font-medium">Motivo</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {citas.map((cita) => (
                    <tr key={cita.id} className={cita.estado === "CANCELADA" ? "bg-neutral-50 text-neutral-500" : ""}>
                      <td className="whitespace-nowrap px-5 py-4 font-medium">{fechaHora(cita.inicioEn)} · {cita.horaInicio}–{cita.horaFin}</td>
                      <td className="px-5 py-4">{cita.odontologo.nombre}</td>
                      <td className="max-w-72 px-5 py-4">{cita.motivo ?? "—"}</td>
                      <td className="px-5 py-4"><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium">{cita.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
