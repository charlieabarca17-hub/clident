import { describe, expect, it } from "vitest";
import { MAX_CENTAVOS, aplicarPorcentaje, centavosDesdeTexto, formatearUSD, usdEditable } from "@/lib/money";

describe("formatearUSD", () => {
  it("formatea centavos como USD salvadoreño", () => {
    expect(formatearUSD(123456)).toBe("$1,234.56");
    expect(formatearUSD(0)).toBe("$0.00");
    expect(formatearUSD(60)).toBe("$0.60");
  });

  // Los montos de las cuotas de ortodoncia de REGLAS-DE-NEGOCIO.md §1.9, que son el
  // ejemplo canónico del proyecto.
  it("formatea los montos del ejemplo de ortodoncia", () => {
    expect(formatearUSD(6000)).toBe("$60.00");
    expect(formatearUSD(108000)).toBe("$1,080.00");
  });

  it("formatea montos negativos (las reversas de AplicacionPago lo son)", () => {
    expect(formatearUSD(-500)).toBe("-$5.00");
  });

  it("formatea el tope de una columna Int sin perder precisión", () => {
    expect(formatearUSD(MAX_CENTAVOS)).toBe("$21,474,836.47");
  });

  // La confusión que ADR-009 llama "un Int mal leído se ve como 100x el precio real".
  it("rechaza dólares disfrazados de centavos", () => {
    expect(() => formatearUSD(10.5)).toThrow(/entero de centavos/);
  });
});

describe("aplicarPorcentaje", () => {
  it("aplica el IVA salvadoreño del 13% sin residuo", () => {
    expect(aplicarPorcentaje(10000, 13)).toBe(1300);
  });

  it("aplica un descuento porcentual", () => {
    expect(aplicarPorcentaje(30000, 10)).toBe(3000);
  });

  // El punto entero de que esta función exista: medio centavo obliga a una decisión, y
  // se toma UNA vez, acá, con prueba (ADR-009).
  it("redondea half-up: medio centavo sube", () => {
    expect(aplicarPorcentaje(105, 50)).toBe(53); // 52.5 → 53, no 52
    expect(aplicarPorcentaje(1, 50)).toBe(1); //    0.5  → 1
    expect(aplicarPorcentaje(3, 50)).toBe(2); //    1.5  → 2
    expect(aplicarPorcentaje(5, 50)).toBe(3); //    2.5  → 3, no 2 (banker's rounding daría 2)
  });

  it("redondea alejándose de cero, no hacia arriba, con montos negativos", () => {
    // Math.round(-52.5) es -52. Una reversa que redondee así devuelve un centavo de
    // menos que la aplicación que compensa, y §12.4 exige que sea exactamente −original.
    expect(aplicarPorcentaje(-105, 50)).toBe(-53);
    expect(aplicarPorcentaje(-1, 50)).toBe(-1);
  });

  it("devuelve enteros siempre", () => {
    for (const centavos of [1, 7, 33, 99, 12345]) {
      for (const pct of [13, 10, 33.3, 7.5]) {
        expect(Number.isInteger(aplicarPorcentaje(centavos, pct))).toBe(true);
      }
    }
  });

  it("no devuelve -0", () => {
    expect(Object.is(aplicarPorcentaje(-100, 0), 0)).toBe(true);
  });

  it("rechaza dólares disfrazados de centavos", () => {
    expect(() => aplicarPorcentaje(10.5, 13)).toThrow(/entero de centavos/);
  });

  it("rechaza un porcentaje que no es número finito", () => {
    expect(() => aplicarPorcentaje(100, Number.NaN)).toThrow(/finito/);
    expect(() => aplicarPorcentaje(100, Number.POSITIVE_INFINITY)).toThrow(/finito/);
  });
});

describe("centavosDesdeTexto", () => {
  it("convierte montos escritos como los escribe una persona", () => {
    expect(centavosDesdeTexto("45")).toBe(4500);
    expect(centavosDesdeTexto("45.5")).toBe(4550);
    expect(centavosDesdeTexto("45.50")).toBe(4550);
    expect(centavosDesdeTexto("$45.50")).toBe(4550);
    expect(centavosDesdeTexto(" $ 1,234.56 ")).toBe(123456);
    expect(centavosDesdeTexto("0.05")).toBe(5);
    expect(centavosDesdeTexto("0")).toBe(0);
  });

  it("no pasa por float: el clásico 0.29 no pierde un centavo", () => {
    // 0.29 * 100 === 28.999999999999996 en IEEE 754; parsear texto lo evita.
    expect(centavosDesdeTexto("0.29")).toBe(29);
    expect(centavosDesdeTexto("19.99")).toBe(1999);
  });

  it("rechaza lo que no es un monto", () => {
    expect(centavosDesdeTexto("")).toBeNull();
    expect(centavosDesdeTexto("abc")).toBeNull();
    expect(centavosDesdeTexto("-5")).toBeNull();
    expect(centavosDesdeTexto("12.345")).toBeNull();
    expect(centavosDesdeTexto("12.")).toBeNull();
    expect(centavosDesdeTexto("1e3")).toBeNull();
  });

  it("rechaza montos que no caben en un Int de PostgreSQL", () => {
    expect(centavosDesdeTexto("21474836.47")).toBe(MAX_CENTAVOS);
    expect(centavosDesdeTexto("21474836.48")).toBeNull();
    expect(centavosDesdeTexto("99999999")).toBeNull();
  });
});

describe("usdEditable", () => {
  it("produce un texto que centavosDesdeTexto devuelve intacto", () => {
    for (const centavos of [0, 5, 29, 4500, 4550, 123456, MAX_CENTAVOS]) {
      expect(centavosDesdeTexto(usdEditable(centavos))).toBe(centavos);
    }
  });

  it("no formatea con símbolos ni separadores", () => {
    expect(usdEditable(4500)).toBe("45.00");
    expect(usdEditable(123456)).toBe("1234.56");
  });
});
