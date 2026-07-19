import { describe, expect, it } from "vitest";

import { generarFechasCuotasMensuales, hoyElSalvador } from "@/lib/fechas";

describe("hoyElSalvador", () => {
  it("es el día civil de UTC-6, no el de UTC", () => {
    // 03:00 UTC del 2 de julio = 21:00 del 1 de julio en El Salvador.
    expect(hoyElSalvador(new Date("2026-07-02T03:00:00Z"))).toBe("2026-07-01");
    expect(hoyElSalvador(new Date("2026-07-02T12:00:00Z"))).toBe("2026-07-02");
  });
});

describe("generarFechasCuotasMensuales", () => {
  it("genera 18 cuotas mensuales manteniendo el día", () => {
    const fechas = generarFechasCuotasMensuales("2026-08-05", 18);
    expect(fechas).toHaveLength(18);
    expect(fechas[0]).toBe("2026-08-05");
    expect(fechas[1]).toBe("2026-09-05");
    expect(fechas[5]).toBe("2027-01-05");
    expect(fechas[17]).toBe("2028-01-05");
  });

  it("el día 31 cae al último día del mes corto, sin saltarse meses", () => {
    const fechas = generarFechasCuotasMensuales("2026-01-31", 4);
    expect(fechas).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("respeta el año bisiesto", () => {
    const fechas = generarFechasCuotasMensuales("2028-01-31", 2);
    expect(fechas[1]).toBe("2028-02-29");
  });
});
