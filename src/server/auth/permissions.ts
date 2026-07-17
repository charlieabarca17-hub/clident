import type { Rol, TenantContext } from "./types";

export const PERMISOS = [
  "agenda:read", "agenda:write",
  "paciente:read", "paciente:write", "paciente:read_pii",
  "clinico:read", "clinico:write",
  "catalogo:read", "catalogo:write",
  "caja:read", "caja:write",
  "inventario:read", "inventario:write",
  "usuarios:read", "usuarios:write",
  "configuracion:read", "configuracion:write",
] as const;

export type Permiso = (typeof PERMISOS)[number];

// Administración no implica facultad clínica. El dueño que también atiende lleva
// ADMINISTRADOR + ODONTOLOGO y recibe la unión; un gerente administrativo no puede
// escribir ni leer alertas, notas o futuros módulos clínicos (ADR-003).
const ADMINISTRADOR_SIN_CLINICO = PERMISOS.filter((permiso) => !permiso.startsWith("clinico:"));

export const PERMISOS_POR_ROL: Record<Rol, readonly Permiso[]> = {
  ADMINISTRADOR: ADMINISTRADOR_SIN_CLINICO,
  ODONTOLOGO: [
    "agenda:read", "agenda:write", "paciente:read", "paciente:write",
    "paciente:read_pii", "clinico:read", "clinico:write", "catalogo:read",
    "caja:read", "inventario:read",
  ],
  RECEPCION: ["agenda:read", "agenda:write", "paciente:read", "paciente:write", "catalogo:read"],
  CAJA: [
    "agenda:read", "paciente:read", "paciente:read_pii", "catalogo:read",
    "caja:read", "caja:write", "inventario:read",
  ],
};

export function tienePermiso(roles: readonly Rol[], permiso: Permiso): boolean {
  return roles.some((rol) => PERMISOS_POR_ROL[rol].includes(permiso));
}

export function requirePermiso(ctx: TenantContext, permiso: Permiso): void {
  if (!tienePermiso(ctx.roles, permiso)) {
    throw new Error("No tenés permiso para realizar esta acción.");
  }
}
