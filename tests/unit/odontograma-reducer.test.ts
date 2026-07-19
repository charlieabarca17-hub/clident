import { describe, expect, it } from "vitest";

import {
  CONDICIONES_DENTALES,
  reducirHistoriaSuperficie,
  type EventoOdontogramaReducible,
} from "@/lib/odontograma";

function evento(parcial: Partial<EventoOdontogramaReducible> & { id: string }): EventoOdontogramaReducible {
  return {
    tipo: "CONDICION_REGISTRADA",
    condicion: "CARIES",
    ocurridoEn: new Date("2026-07-01T10:00:00Z"),
    creadoEn: new Date("2026-07-01T10:00:00Z"),
    anulaEventoId: null,
    ...parcial,
  };
}

describe("reducirHistoriaSuperficie", () => {
  it("sin eventos no hay estado", () => {
    expect(reducirHistoriaSuperficie([])).toBeNull();
  });

  it("gana el último evento por ocurridoEn", () => {
    const estado = reducirHistoriaSuperficie([
      evento({ id: "e1", condicion: "CARIES", ocurridoEn: new Date("2026-07-01T10:00:00Z") }),
      evento({ id: "e2", condicion: "OBTURACION", ocurridoEn: new Date("2026-07-10T10:00:00Z") }),
    ]);
    expect(estado?.condicion).toBe("OBTURACION");
    expect(estado?.ultimoEventoId).toBe("e2");
  });

  it("un evento retroactivo NO le gana a uno más nuevo", () => {
    const estado = reducirHistoriaSuperficie([
      evento({ id: "nuevo", condicion: "OBTURACION", ocurridoEn: new Date("2026-07-10T10:00:00Z"), creadoEn: new Date("2026-07-10T10:00:00Z") }),
      // Capturado DESPUÉS pero ocurrido ANTES: retroactivo.
      evento({ id: "retro", condicion: "CARIES", ocurridoEn: new Date("2026-06-01T10:00:00Z"), creadoEn: new Date("2026-07-15T10:00:00Z") }),
    ]);
    expect(estado?.ultimoEventoId).toBe("nuevo");
  });

  it("mismo ocurridoEn: desempata creadoEn — la tupla completa, no un solo campo", () => {
    const mismoInstante = new Date("2026-07-01T10:00:00Z");
    const estado = reducirHistoriaSuperficie([
      evento({ id: "primero", condicion: "CARIES", ocurridoEn: mismoInstante, creadoEn: new Date("2026-07-01T10:00:00Z") }),
      evento({ id: "segundo", condicion: "SELLANTE", ocurridoEn: mismoInstante, creadoEn: new Date("2026-07-01T10:00:05Z") }),
    ]);
    expect(estado?.ultimoEventoId).toBe("segundo");
  });

  it("anular el ganador revela el evento no anulado anterior", () => {
    const estado = reducirHistoriaSuperficie([
      evento({ id: "e1", condicion: "SANO", ocurridoEn: new Date("2026-07-01T10:00:00Z") }),
      evento({ id: "e2", condicion: "CARIES", ocurridoEn: new Date("2026-07-10T10:00:00Z") }),
      evento({
        id: "anulacion",
        tipo: "CONDICION_ANULADA",
        condicion: null,
        ocurridoEn: new Date("2026-07-12T10:00:00Z"),
        creadoEn: new Date("2026-07-12T10:00:00Z"),
        anulaEventoId: "e2",
      }),
    ]);
    // El estado correcto NO sale del evento de anulación: sale de e1.
    expect(estado?.condicion).toBe("SANO");
    expect(estado?.ultimoEventoId).toBe("e1");
  });

  it("si todo se anuló, la superficie queda sin estado (fila borrada)", () => {
    const estado = reducirHistoriaSuperficie([
      evento({ id: "e1", condicion: "CARIES" }),
      evento({
        id: "anulacion",
        tipo: "CONDICION_ANULADA",
        condicion: null,
        ocurridoEn: new Date("2026-07-12T10:00:00Z"),
        anulaEventoId: "e1",
      }),
    ]);
    expect(estado).toBeNull();
  });

  it("la anulación posterior a un evento más nuevo no lo afecta", () => {
    const estado = reducirHistoriaSuperficie([
      evento({ id: "e1", condicion: "CARIES", ocurridoEn: new Date("2026-07-01T10:00:00Z") }),
      evento({
        id: "anulacion-e1",
        tipo: "CONDICION_ANULADA",
        condicion: null,
        ocurridoEn: new Date("2026-07-05T10:00:00Z"),
        anulaEventoId: "e1",
      }),
      evento({ id: "e2", condicion: "OBTURACION", ocurridoEn: new Date("2026-07-03T10:00:00Z") }),
    ]);
    expect(estado?.condicion).toBe("OBTURACION");
  });

  it("TRATAMIENTO_INDICADO marca pendiente; PROCEDIMIENTO_REALIZADO lo limpia", () => {
    const indicado = reducirHistoriaSuperficie([
      evento({ id: "e1", tipo: "TRATAMIENTO_INDICADO", condicion: "CARIES" }),
    ]);
    expect(indicado?.tratamientoPendiente).toBe(true);

    const realizado = reducirHistoriaSuperficie([
      evento({ id: "e1", tipo: "TRATAMIENTO_INDICADO", condicion: "CARIES", ocurridoEn: new Date("2026-07-01T10:00:00Z") }),
      evento({ id: "e2", tipo: "PROCEDIMIENTO_REALIZADO", condicion: "OBTURACION", ocurridoEn: new Date("2026-07-08T10:00:00Z") }),
    ]);
    expect(realizado?.tratamientoPendiente).toBe(false);
    expect(realizado?.condicion).toBe("OBTURACION");
  });

  it("el catálogo tiene exactamente 16 condiciones con colores únicos", () => {
    expect(CONDICIONES_DENTALES).toHaveLength(16);
    expect(new Set(CONDICIONES_DENTALES.map((c) => c.condicion)).size).toBe(16);
    expect(new Set(CONDICIONES_DENTALES.map((c) => c.color)).size).toBe(16);
  });
});
