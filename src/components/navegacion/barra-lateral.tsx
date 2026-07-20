"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  CalendarDays,
  LayoutDashboard,
  PackageSearch,
  Settings,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

export type IconoNavegacion = "inicio" | "agenda" | "pacientes" | "catalogo" | "caja" | "inventario" | "configuracion";
export type EnlaceNavegacion = { href: string; etiqueta: string; icono: IconoNavegacion };
export type GrupoNavegacion = { titulo: string; enlaces: EnlaceNavegacion[] };

const ICONOS: Record<IconoNavegacion, LucideIcon> = {
  inicio: LayoutDashboard,
  agenda: CalendarDays,
  pacientes: Users,
  catalogo: PackageSearch,
  caja: WalletCards,
  inventario: Boxes,
  configuracion: Settings,
};

/**
 * Navegación global. Los grupos llegan YA FILTRADOS por permisos desde el
 * servidor: este componente no decide qué puede ver nadie, solo lo dibuja.
 *
 * Es cliente únicamente por `usePathname` (marcar la sección activa). En móvil
 * el menú abre con un <details> nativo: sin estado de React, sin JavaScript
 * propio, y funciona igual si el script no cargó.
 *
 * Identidad visual: fondo verde profundo con un arco menta marcando la sección activa.
 * El arco no es decoración suelta — es la misma idea que el odontograma en arco
 * anatómico: la anatomía vive en la estructura, no en ilustraciones pegadas.
 */
export function BarraLateral({ grupos, clinica }: { grupos: GrupoNavegacion[]; clinica: string }) {
  const rutaActual = usePathname();

  const esActivo = (href: string) =>
    href === "/dashboard" ? rutaActual === href : rutaActual.startsWith(href);

  const lista = (
    <nav className="space-y-6" aria-label="Secciones de CLIDENT">
      {grupos.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/55">
            {grupo.titulo}
          </p>
          <ul className="mt-2 space-y-0.5">
            {grupo.enlaces.map((enlace) => {
              const activo = esActivo(enlace.href);
              const Icono = ICONOS[enlace.icono];
              return (
                <li key={enlace.href}>
                  <Link
                    href={enlace.href}
                    aria-current={activo ? "page" : undefined}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      activo
                        ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <Icono className="size-4 shrink-0" strokeWidth={activo ? 2.2 : 1.7} aria-hidden="true" />
                    <span>{enlace.etiqueta}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const marca = (tamano: "escritorio" | "movil") => (
    <>
      <span
        className={`block font-semibold tracking-tight text-sidebar-foreground ${
          tamano === "escritorio" ? "text-lg" : "text-base"
        }`}
      >
        CLIDENT
      </span>
      <span className="mt-0.5 block truncate text-xs text-sidebar-foreground/60">{clinica}</span>
    </>
  );

  return (
    <>
      {/* Escritorio: columna fija. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <Link href="/dashboard" className="rounded-xl px-3 py-2 transition-colors hover:bg-sidebar-accent/50">
          {marca("escritorio")}
        </Link>
        <div className="mt-6 flex-1 overflow-y-auto">{lista}</div>
        <p className="border-t border-sidebar-border px-3 pt-4 text-[11px] leading-4 text-sidebar-foreground/45">
          Tecnología clínica con información trazable.
        </p>
      </aside>

      {/* Móvil y tablet: menú desplegable nativo. */}
      <details className="group bg-sidebar lg:hidden">
        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
          <span>{marca("movil")}</span>
          <span className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-1.5 text-xs font-medium text-sidebar-accent-foreground">
            <span className="group-open:hidden">Menú</span>
            <span className="hidden group-open:inline">Cerrar</span>
          </span>
        </summary>
        <div className="border-t border-sidebar-border p-4">{lista}</div>
      </details>
    </>
  );
}
