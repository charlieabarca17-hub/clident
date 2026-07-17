import { describe, expect, it } from "vitest";

import { PERMISOS, PERMISOS_POR_ROL, requirePermiso, tienePermiso } from "@/server/auth/permissions";
import type { TenantContext } from "@/server/auth/types";

describe("permisos por rol", () => {
  it("combina permisos de múltiples roles", () => {
    expect(tienePermiso(["RECEPCION", "CAJA"], "agenda:write")).toBe(true);
    expect(tienePermiso(["RECEPCION", "CAJA"], "caja:write")).toBe(true);
    expect(tienePermiso(["RECEPCION", "CAJA"], "clinico:read")).toBe(false);
  });

  it("el administrador administra sin acceder al expediente clínico", () => {
    expect(tienePermiso(["ADMINISTRADOR"], "configuracion:write")).toBe(true);
    expect(tienePermiso(["ADMINISTRADOR"], "clinico:read")).toBe(false);
    expect(tienePermiso(["ADMINISTRADOR"], "clinico:write")).toBe(false);
    expect(tienePermiso(["ADMINISTRADOR", "ODONTOLOGO"], "clinico:write")).toBe(true);
  });

  it("mantiene exactamente la matriz canónica, incluidas las negaciones de datos sensibles", () => {
    expect(PERMISOS_POR_ROL).toEqual({
      ADMINISTRADOR: PERMISOS.filter((permiso) => !permiso.startsWith("clinico:")),
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
    });
    expect(tienePermiso(["RECEPCION"], "paciente:read_pii")).toBe(false);
    expect(tienePermiso(["RECEPCION"], "clinico:read")).toBe(false);
    expect(tienePermiso(["RECEPCION"], "caja:read")).toBe(false);
    expect(tienePermiso(["CAJA"], "clinico:read")).toBe(false);
    expect(tienePermiso(["CAJA"], "agenda:write")).toBe(false);
    expect(tienePermiso(["ODONTOLOGO"], "caja:write")).toBe(false);
    expect(tienePermiso(["ODONTOLOGO"], "usuarios:write")).toBe(false);
    expect(tienePermiso(["ODONTOLOGO"], "configuracion:write")).toBe(false);
  });

  it("requirePermiso falla antes de ejecutar una operación prohibida", () => {
    const ctx: TenantContext = {
      usuarioId: "usuario",
      clinicaId: "clinica",
      membresiaId: "membresia",
      roles: ["RECEPCION"],
    };
    expect(() => requirePermiso(ctx, "caja:write")).toThrow("No tenés permiso");
  });
});
