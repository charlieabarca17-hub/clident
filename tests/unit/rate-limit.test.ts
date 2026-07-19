import { beforeEach, describe, expect, it } from "vitest";

import {
  LIMITES_LOGIN,
  estaBloqueado,
  limpiarIntentos,
  registrarIntentoFallido,
  reiniciarRateLimit,
} from "@/server/auth/rate-limit";

describe("rate limit de login", () => {
  beforeEach(() => reiniciarRateLimit());

  it("bloquea al llegar al máximo de intentos, no antes", () => {
    const correo = "atacado@clident.test";
    for (let intento = 1; intento < LIMITES_LOGIN.MAX_INTENTOS; intento += 1) {
      registrarIntentoFallido(correo);
      expect(estaBloqueado(correo), `intento ${intento}`).toBe(false);
    }
    expect(registrarIntentoFallido(correo)).toBe(true);
    expect(estaBloqueado(correo)).toBe(true);
  });

  it("un login exitoso limpia el castigo acumulado", () => {
    const correo = "legitimo@clident.test";
    registrarIntentoFallido(correo);
    registrarIntentoFallido(correo);
    limpiarIntentos(correo);
    for (let intento = 1; intento < LIMITES_LOGIN.MAX_INTENTOS; intento += 1) {
      registrarIntentoFallido(correo);
    }
    expect(estaBloqueado(correo)).toBe(false);
  });

  it("el bloqueo expira al pasar la ventana", () => {
    const correo = "expira@clident.test";
    const inicio = Date.now();
    for (let intento = 0; intento < LIMITES_LOGIN.MAX_INTENTOS; intento += 1) {
      registrarIntentoFallido(correo, inicio);
    }
    expect(estaBloqueado(correo, inicio)).toBe(true);
    expect(estaBloqueado(correo, inicio + LIMITES_LOGIN.VENTANA_MS + 1)).toBe(false);
  });

  it("bloquear un correo no afecta a otro: la recepción entera no cae por uno", () => {
    const atacado = "uno@clident.test";
    for (let intento = 0; intento < LIMITES_LOGIN.MAX_INTENTOS; intento += 1) {
      registrarIntentoFallido(atacado);
    }
    expect(estaBloqueado(atacado)).toBe(true);
    expect(estaBloqueado("otro@clident.test")).toBe(false);
  });

  it("no distingue mayúsculas ni espacios: el mismo correo es el mismo contador", () => {
    for (let intento = 0; intento < LIMITES_LOGIN.MAX_INTENTOS; intento += 1) {
      registrarIntentoFallido("  Mixto@Clident.test ");
    }
    expect(estaBloqueado("mixto@clident.test")).toBe(true);
  });
});
