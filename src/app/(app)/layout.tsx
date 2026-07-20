import { cerrarSesion } from "@/server/actions/auth";
import Link from "next/link";
import { CalendarPlus, Search } from "lucide-react";
import { BarraLateral, type GrupoNavegacion } from "@/components/navegacion/barra-lateral";
import { requireCtx } from "@/server/auth/context";
import { tienePermiso } from "@/server/auth/permissions";
import { getClinicaActiva } from "@/server/db/clinicas";

/**
 * Envuelve todo lo autenticado. `requireCtx()` corre acá una vez por request y
 * revalida la membresía contra PostgreSQL: si alguien pierde acceso, el
 * siguiente request lo expulsa aunque su JWT siga vivo.
 *
 * La navegación se arma EN EL SERVIDOR según los permisos del rol. Un enlace
 * que no corresponde no se oculta con CSS: no existe en el HTML enviado.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const clinica = await getClinicaActiva(ctx);

  const grupos: GrupoNavegacion[] = [
    {
      titulo: "Principal",
      enlaces: [
        { href: "/dashboard", etiqueta: "Inicio", icono: "inicio" as const },
        ...(tienePermiso(ctx.roles, "agenda:read") ? [{ href: "/agenda", etiqueta: "Agenda", icono: "agenda" as const }] : []),
        ...(tienePermiso(ctx.roles, "paciente:read") ? [{ href: "/pacientes", etiqueta: "Pacientes", icono: "pacientes" as const }] : []),
      ],
    },
    {
      titulo: "Clínico",
      enlaces: [
        ...(tienePermiso(ctx.roles, "catalogo:read") ? [{ href: "/catalogo", etiqueta: "Catálogo", icono: "catalogo" as const }] : []),
      ],
    },
    {
      titulo: "Finanzas",
      enlaces: [
        ...(tienePermiso(ctx.roles, "caja:read") ? [{ href: "/caja", etiqueta: "Caja", icono: "caja" as const }] : []),
        ...(tienePermiso(ctx.roles, "inventario:read") ? [{ href: "/inventario", etiqueta: "Inventario", icono: "inventario" as const }] : []),
      ],
    },
    {
      titulo: "Gestión",
      enlaces: [
        { href: "/configuracion/integraciones", etiqueta: "Configuración", icono: "configuracion" as const },
      ],
    },
  ].filter((grupo) => grupo.enlaces.length > 0);

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <BarraLateral grupos={grupos} clinica={clinica?.nombre ?? "Clínica"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b bg-card/95 px-5 py-2.5 text-sm backdrop-blur sm:px-8">
          <form action="/pacientes" className="relative hidden w-full max-w-md md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input name="q" aria-label="Buscar paciente" placeholder="Buscar paciente por nombre o teléfono…" className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm" />
          </form>
          <div className="ml-auto flex items-center gap-3">
            {tienePermiso(ctx.roles, "agenda:write") ? (
              <Link href="/agenda/nueva" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                <CalendarPlus className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Nueva cita</span>
              </Link>
            ) : null}
            <span className="hidden truncate text-muted-foreground xl:inline">{ctx.roles.join(" · ")}</span>
          <form action={cerrarSesion}>
            <button className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
              Cerrar sesión
            </button>
          </form>
          </div>
        </header>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
