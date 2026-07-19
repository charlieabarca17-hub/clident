import { cerrarSesion } from "@/server/actions/auth";
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
        { href: "/dashboard", etiqueta: "Tablero" },
        ...(tienePermiso(ctx.roles, "agenda:read") ? [{ href: "/agenda", etiqueta: "Agenda" }] : []),
        ...(tienePermiso(ctx.roles, "paciente:read") ? [{ href: "/pacientes", etiqueta: "Pacientes" }] : []),
      ],
    },
    {
      titulo: "Clínico",
      enlaces: [
        ...(tienePermiso(ctx.roles, "catalogo:read") ? [{ href: "/catalogo", etiqueta: "Catálogo" }] : []),
      ],
    },
    {
      titulo: "Finanzas",
      enlaces: [
        ...(tienePermiso(ctx.roles, "caja:read") ? [{ href: "/caja", etiqueta: "Caja" }] : []),
        ...(tienePermiso(ctx.roles, "inventario:read") ? [{ href: "/inventario", etiqueta: "Inventario" }] : []),
      ],
    },
  ].filter((grupo) => grupo.enlaces.length > 0);

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <BarraLateral grupos={grupos} clinica={clinica?.nombre ?? "Clínica"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b bg-card px-5 py-2.5 text-sm">
          <span className="hidden truncate text-muted-foreground sm:inline">{ctx.roles.join(" · ")}</span>
          <form action={cerrarSesion}>
            <button className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
              Cerrar sesión
            </button>
          </form>
        </header>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
