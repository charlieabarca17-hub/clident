"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type EnlaceNavegacion = { href: string; etiqueta: string };
export type GrupoNavegacion = { titulo: string; enlaces: EnlaceNavegacion[] };

/**
 * Navegación global. Los grupos llegan YA FILTRADOS por permisos desde el
 * servidor: este componente no decide qué puede ver nadie, solo lo dibuja.
 *
 * Es cliente únicamente por `usePathname` (marcar la sección activa). En móvil
 * el menú abre con un <details> nativo: sin estado de React, sin JavaScript
 * propio, y funciona igual si el script no cargó.
 */
export function BarraLateral({ grupos, clinica }: { grupos: GrupoNavegacion[]; clinica: string }) {
  const rutaActual = usePathname();

  const esActivo = (href: string) =>
    href === "/dashboard" ? rutaActual === href : rutaActual.startsWith(href);

  const lista = (
    <nav className="space-y-6" aria-label="Secciones de CLIDENT">
      {grupos.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {grupo.titulo}
          </p>
          <ul className="mt-2 space-y-0.5">
            {grupo.enlaces.map((enlace) => (
              <li key={enlace.href}>
                <Link
                  href={enlace.href}
                  aria-current={esActivo(enlace.href) ? "page" : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                    esActivo(enlace.href)
                      ? "bg-white/10 font-medium text-white"
                      : "text-neutral-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {enlace.etiqueta}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Escritorio: columna fija. */}
      <aside className="hidden w-60 shrink-0 flex-col bg-neutral-900 p-4 lg:flex">
        <Link href="/dashboard" className="px-3 py-2">
          <span className="block text-lg font-semibold tracking-tight text-white">CLIDENT</span>
          <span className="mt-0.5 block truncate text-xs text-neutral-400">{clinica}</span>
        </Link>
        <div className="mt-6 flex-1 overflow-y-auto">{lista}</div>
      </aside>

      {/* Móvil y tablet: menú desplegable nativo. */}
      <details className="group bg-neutral-900 lg:hidden">
        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-white marker:content-none [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-base font-semibold tracking-tight">CLIDENT</span>
            <span className="block truncate text-xs text-neutral-400">{clinica}</span>
          </span>
          <span className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium">
            <span className="group-open:hidden">Menú</span>
            <span className="hidden group-open:inline">Cerrar</span>
          </span>
        </summary>
        <div className="border-t border-white/10 p-4">{lista}</div>
      </details>
    </>
  );
}
