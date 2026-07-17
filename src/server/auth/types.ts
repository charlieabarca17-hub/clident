export const ROLES = ["ADMINISTRADOR", "ODONTOLOGO", "RECEPCION", "CAJA"] as const;

export type Rol = (typeof ROLES)[number];

export type AuthContext = Readonly<{ usuarioId: string }>;

export type TenantContext = Readonly<{
  usuarioId: string;
  clinicaId: string;
  membresiaId: string;
  roles: readonly Rol[];
}>;
