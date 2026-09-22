import "server-only";

import { requirePermiso } from "@/server/auth/permissions";
import type { TenantContext } from "@/server/auth/types";

import { conTenant } from "./tenant";

/**
 * El vistazo de la boca que se muestra al abrir el expediente.
 *
 * **Qué es y qué no es.** Es un resumen de lo que el sistema YA tiene
 * registrado: qué piezas tienen una condición anotada en el odontograma, en
 * cuáles hay un procedimiento realizado y cuáles aparecen en un tratamiento
 * aceptado que todavía no se ejecutó. **No interpreta, no diagnostica y no
 * decide nada clínico** (`CLAUDE.md` §15): si una pieza aparece marcada es
 * porque alguien lo registró, no porque el software lo dedujo.
 *
 * **De dónde salen los datos.** De la proyección del odontograma
 * (`estados_superficie`), de los dientes de los procedimientos REALIZADOS y de
 * los dientes de los `PlanItem` aceptados o en proceso. Los tres son lecturas:
 * este archivo no escribe nada.
 */

/** Lo que se sabe de una pieza, sin interpretar. */
export type PiezaDelResumen = {
  readonly fdi: number;
  /** Condiciones anotadas en el odontograma, sin `SANO` y sin repetir. */
  readonly condiciones: readonly string[];
  /** Hay al menos un procedimiento REALIZADO que tocó esta pieza. */
  readonly tratada: boolean;
  /** El odontograma marcó tratamiento pendiente en alguna de sus caras. */
  readonly conPendiente: boolean;
  /** Aparece en un tratamiento aceptado o en proceso que todavía no se hizo. */
  readonly planificada: boolean;
  /** Nombres de los tratamientos ya hechos en esta pieza, del más reciente al más viejo. */
  readonly tratamientosHechos: readonly string[];
};

export async function getResumenBoca(ctx: TenantContext, pacienteId: string) {
  requirePermiso(ctx, "clinico:read");
  return conTenant(ctx, async (tx) => {
    const paciente = await tx.paciente.findFirst({
      where: { id: pacienteId, clinicaId: ctx.clinicaId },
      select: { id: true },
    });
    if (!paciente) return null;

    const [estados, dientesTratados, dientesPlanificados] = await Promise.all([
      tx.estadoSuperficie.findMany({
        where: { clinicaId: ctx.clinicaId, pacienteId },
        select: { fdi: true, condicion: true, tratamientoPendiente: true },
        orderBy: { fdi: "asc" },
      }),
      // Solo REALIZADO: un procedimiento anulado no dejó de existir, pero
      // tampoco trató la pieza (§9). No se borra del historial; no se cuenta acá.
      tx.procedimientoDiente.findMany({
        where: {
          clinicaId: ctx.clinicaId,
          procedimiento: { clinicaId: ctx.clinicaId, pacienteId, estado: "REALIZADO" },
        },
        select: {
          fdi: true,
          procedimiento: { select: { realizadoEn: true, tratamientoNombre: true } },
        },
        orderBy: { procedimiento: { realizadoEn: "desc" } },
      }),
      // Aceptado o en proceso: lo que el paciente aprobó y todavía no terminó.
      // PROPUESTO no entra — un presupuesto no es un compromiso (§8).
      tx.planItemDiente.findMany({
        where: {
          clinicaId: ctx.clinicaId,
          planItem: {
            clinicaId: ctx.clinicaId,
            estado: { in: ["ACEPTADO", "EN_PROCESO"] },
            plan: { clinicaId: ctx.clinicaId, pacienteId, estado: "ACEPTADO" },
          },
        },
        select: { fdi: true },
      }),
    ]);

    const porPieza = new Map<number, {
      condiciones: Set<string>;
      tratada: boolean;
      conPendiente: boolean;
      planificada: boolean;
      tratamientosHechos: string[];
    }>();

    const pieza = (fdi: number) => {
      let actual = porPieza.get(fdi);
      if (!actual) {
        actual = {
          condiciones: new Set<string>(),
          tratada: false,
          conPendiente: false,
          planificada: false,
          tratamientosHechos: [],
        };
        porPieza.set(fdi, actual);
      }
      return actual;
    };

    for (const estado of estados) {
      const p = pieza(estado.fdi);
      // `SANO` es el estado por defecto: marcarlo llenaría la boca de ruido.
      if (estado.condicion !== "SANO") p.condiciones.add(estado.condicion);
      if (estado.tratamientoPendiente) p.conPendiente = true;
    }
    for (const diente of dientesTratados) {
      const p = pieza(diente.fdi);
      p.tratada = true;
      const nombre = diente.procedimiento.tratamientoNombre;
      if (!p.tratamientosHechos.includes(nombre)) p.tratamientosHechos.push(nombre);
    }
    for (const diente of dientesPlanificados) pieza(diente.fdi).planificada = true;

    const piezas: PiezaDelResumen[] = [...porPieza.entries()]
      .map(([fdi, datos]) => ({
        fdi,
        condiciones: [...datos.condiciones].sort(),
        tratada: datos.tratada,
        conPendiente: datos.conPendiente,
        planificada: datos.planificada,
        tratamientosHechos: datos.tratamientosHechos,
      }))
      .sort((a, b) => a.fdi - b.fdi);

    return {
      piezas,
      // Una pieza planificada que ya se trató cuenta en las dos: son hechos
      // distintos, no etapas de un semáforo.
      totalTratadas: piezas.filter((p) => p.tratada).length,
      totalConHallazgo: piezas.filter((p) => p.condiciones.length > 0).length,
      totalPlanificadas: piezas.filter((p) => p.planificada && !p.tratada).length,
      totalConPendiente: piezas.filter((p) => p.conPendiente).length,
    };
  });
}
