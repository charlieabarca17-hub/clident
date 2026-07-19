import "server-only";

import type { TenantContext } from "@/server/auth/types";
import { requirePermiso, tienePermiso } from "@/server/auth/permissions";
import { etiquetaCondicion, type CondicionDental } from "@/lib/odontograma";

import { conTenant } from "./tenant";

export type TipoEventoHistorial =
  | "CITA"
  | "DIAGNOSTICO"
  | "ODONTOGRAMA"
  | "PLAN"
  | "PROCEDIMIENTO"
  | "CARGO"
  | "PAGO";

export type EventoHistorial = {
  id: string;
  tipo: TipoEventoHistorial;
  // El instante en que OCURRIÓ el hecho, no en que se capturó: el timeline
  // cuenta la historia del paciente, no la del tecleo.
  ocurridoEn: string;
  titulo: string;
  detalle: string | null;
  anulado: boolean;
  montoCentavos: number | null;
  autor: string | null;
  enlace: string | null;
};

/**
 * El recorrido completo de un paciente en una sola línea de tiempo.
 *
 * Es SOLO LECTURA y respeta permisos: sin `clinico:read` no aparecen
 * diagnósticos, odontograma ni procedimientos; sin `caja:read` no aparecen
 * cargos ni pagos. No hay un "historial completo" que se filtre en la UI —
 * lo que el rol no puede ver, este repositorio no lo consulta.
 *
 * Los anulados NO se esconden: se muestran marcados. Ese es el punto de un
 * expediente append-only (REGLAS §3.1) — esconder lo anulado sería reescribir
 * la historia en la capa de presentación.
 */
export async function getHistorialPaciente(ctx: TenantContext, pacienteId: string) {
  requirePermiso(ctx, "paciente:read");
  const puedeVerClinico = tienePermiso(ctx.roles, "clinico:read");
  const puedeVerCaja = tienePermiso(ctx.roles, "caja:read");

  return conTenant(ctx, async (tx) => {
    const paciente = await tx.paciente.findFirst({
      where: { id: pacienteId, clinicaId: ctx.clinicaId },
      select: { id: true, nombres: true, apellidos: true, creadoEn: true },
    });
    if (!paciente) return null;

    const eventos: EventoHistorial[] = [];
    const base = { clinicaId: ctx.clinicaId, pacienteId };

    // Apertura del expediente: el primer punto de la línea de tiempo.
    eventos.push({
      id: `paciente-${paciente.id}`,
      tipo: "CITA",
      ocurridoEn: paciente.creadoEn.toISOString(),
      titulo: "Expediente abierto",
      detalle: null,
      anulado: false,
      montoCentavos: null,
      autor: null,
      enlace: null,
    });

    const citas = await tx.cita.findMany({
      where: base,
      select: {
        id: true,
        inicioEn: true,
        estado: true,
        motivo: true,
        odontologo: { select: { usuario: { select: { nombre: true } } } },
      },
      orderBy: { inicioEn: "desc" },
      take: 100,
    });
    for (const cita of citas) {
      eventos.push({
        id: `cita-${cita.id}`,
        tipo: "CITA",
        ocurridoEn: cita.inicioEn.toISOString(),
        titulo: cita.estado === "CANCELADA" ? "Cita cancelada" : "Cita agendada",
        detalle: cita.motivo,
        anulado: cita.estado === "CANCELADA",
        montoCentavos: null,
        autor: cita.odontologo.usuario.nombre,
        enlace: "/agenda",
      });
    }

    if (puedeVerClinico) {
      const diagnosticos = await tx.diagnostico.findMany({
        where: { clinicaId: ctx.clinicaId, expediente: { pacienteId } },
        select: {
          id: true,
          descripcion: true,
          creadoEn: true,
          anuladoEn: true,
          motivoAnulacion: true,
          registradoPor: { select: { usuario: { select: { nombre: true } } } },
          dientes: { select: { fdi: true, superficie: true } },
        },
        orderBy: { creadoEn: "desc" },
        take: 100,
      });
      for (const diagnostico of diagnosticos) {
        const piezas = diagnostico.dientes.map((d) => d.fdi).join(", ");
        eventos.push({
          id: `dx-${diagnostico.id}`,
          tipo: "DIAGNOSTICO",
          ocurridoEn: diagnostico.creadoEn.toISOString(),
          titulo: diagnostico.descripcion,
          detalle: [piezas ? `Piezas: ${piezas}` : null, diagnostico.motivoAnulacion ? `Anulado: ${diagnostico.motivoAnulacion}` : null]
            .filter(Boolean)
            .join(" · ") || null,
          anulado: diagnostico.anuladoEn !== null,
          montoCentavos: null,
          autor: diagnostico.registradoPor.usuario.nombre,
          enlace: `/pacientes/${pacienteId}/diagnosticos`,
        });
      }

      const odontograma = await tx.eventoOdontograma.findMany({
        where: base,
        select: {
          id: true,
          tipo: true,
          condicion: true,
          fdi: true,
          superficie: true,
          ocurridoEn: true,
          motivoAnulacion: true,
          anulaEventoId: true,
          registradoPor: { select: { usuario: { select: { nombre: true } } } },
        },
        orderBy: { ocurridoEn: "desc" },
        take: 150,
      });
      const anulados = new Set(
        odontograma.filter((e) => e.anulaEventoId).map((e) => e.anulaEventoId as string),
      );
      for (const evento of odontograma) {
        // Los eventos de anulación no son entradas propias del historial: su
        // efecto se ve en el evento anulado, que aparece tachado.
        if (evento.tipo === "CONDICION_ANULADA") continue;
        const cara = evento.superficie === "COMPLETO" ? "" : ` (${evento.superficie.toLowerCase()})`;
        eventos.push({
          id: `odo-${evento.id}`,
          tipo: "ODONTOGRAMA",
          ocurridoEn: evento.ocurridoEn.toISOString(),
          titulo: `${evento.condicion ? etiquetaCondicion(evento.condicion as CondicionDental) : evento.tipo} · pieza ${evento.fdi}${cara}`,
          detalle: null,
          anulado: anulados.has(evento.id),
          montoCentavos: null,
          autor: evento.registradoPor.usuario.nombre,
          enlace: `/pacientes/${pacienteId}/odontograma`,
        });
      }

      const planes = await tx.planTratamiento.findMany({
        where: base,
        select: {
          id: true,
          titulo: true,
          estado: true,
          creadoEn: true,
          presentadoEn: true,
          aceptadoEn: true,
          rechazadoEn: true,
          anuladoEn: true,
          creadoPor: { select: { usuario: { select: { nombre: true } } } },
          items: { select: { precioUnitarioCentavos: true, descuentoCentavos: true, estado: true } },
        },
        orderBy: { creadoEn: "desc" },
        take: 50,
      });
      for (const plan of planes) {
        const total = plan.items
          .filter((item) => item.estado !== "CANCELADO" && item.estado !== "ANULADO")
          .reduce((suma, item) => suma + item.precioUnitarioCentavos - item.descuentoCentavos, 0);
        // Un plan aporta el hito más reciente de su recorrido: presentado,
        // aceptado o rechazado son fechas distintas y todas importan.
        const hitos: Array<[Date | null, string]> = [
          [plan.creadoEn, "Plan creado"],
          [plan.presentadoEn, "Plan presentado al paciente"],
          [plan.aceptadoEn, "Plan aceptado por el paciente"],
          [plan.rechazadoEn, "Plan rechazado por el paciente"],
          [plan.anuladoEn, "Plan anulado"],
        ];
        for (const [fecha, titulo] of hitos) {
          if (!fecha) continue;
          eventos.push({
            id: `plan-${plan.id}-${titulo}`,
            tipo: "PLAN",
            ocurridoEn: fecha.toISOString(),
            titulo: `${titulo}: ${plan.titulo ?? "Plan de tratamiento"}`,
            detalle: null,
            anulado: plan.estado === "ANULADO",
            montoCentavos: total,
            autor: plan.creadoPor.usuario.nombre,
            enlace: `/pacientes/${pacienteId}/planes/${plan.id}`,
          });
        }
      }

      const procedimientos = await tx.procedimiento.findMany({
        where: base,
        select: {
          id: true,
          tratamientoNombre: true,
          realizadoEn: true,
          precioAplicadoCentavos: true,
          estado: true,
          motivoAnulacion: true,
          notasClinicas: true,
          odontologo: { select: { usuario: { select: { nombre: true } } } },
          dientes: { select: { fdi: true } },
        },
        orderBy: { realizadoEn: "desc" },
        take: 100,
      });
      for (const procedimiento of procedimientos) {
        const piezas = procedimiento.dientes.map((d) => d.fdi).join(", ");
        eventos.push({
          id: `proc-${procedimiento.id}`,
          tipo: "PROCEDIMIENTO",
          ocurridoEn: procedimiento.realizadoEn.toISOString(),
          titulo: procedimiento.tratamientoNombre,
          detalle: [
            piezas ? `Piezas: ${piezas}` : null,
            procedimiento.notasClinicas,
            procedimiento.motivoAnulacion ? `Anulado: ${procedimiento.motivoAnulacion}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
          anulado: procedimiento.estado === "ANULADO",
          montoCentavos: procedimiento.precioAplicadoCentavos,
          autor: procedimiento.odontologo.usuario.nombre,
          enlace: `/pacientes/${pacienteId}/procedimientos`,
        });
      }
    }

    if (puedeVerCaja) {
      const cargos = await tx.cargo.findMany({
        where: base,
        select: {
          id: true,
          descripcion: true,
          montoCentavos: true,
          creadoEn: true,
          fechaExigibleEn: true,
          anuladoEn: true,
          motivoAnulacion: true,
          creadoPor: { select: { usuario: { select: { nombre: true } } } },
        },
        orderBy: { creadoEn: "desc" },
        take: 150,
      });
      for (const cargo of cargos) {
        eventos.push({
          id: `cargo-${cargo.id}`,
          tipo: "CARGO",
          ocurridoEn: cargo.creadoEn.toISOString(),
          titulo: `Cargo: ${cargo.descripcion}`,
          detalle: [
            `Exigible el ${cargo.fechaExigibleEn.toISOString().slice(0, 10)}`,
            cargo.motivoAnulacion ? `Anulado: ${cargo.motivoAnulacion}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          anulado: cargo.anuladoEn !== null,
          montoCentavos: cargo.montoCentavos,
          autor: cargo.creadoPor.usuario.nombre,
          enlace: `/caja/${pacienteId}`,
        });
      }

      const pagos = await tx.pago.findMany({
        where: base,
        select: {
          id: true,
          montoCentavos: true,
          metodo: true,
          referencia: true,
          creadoEn: true,
          anuladoEn: true,
          motivoAnulacion: true,
          creadoPor: { select: { usuario: { select: { nombre: true } } } },
        },
        orderBy: { creadoEn: "desc" },
        take: 150,
      });
      for (const pago of pagos) {
        eventos.push({
          id: `pago-${pago.id}`,
          tipo: "PAGO",
          ocurridoEn: pago.creadoEn.toISOString(),
          titulo: `Pago recibido (${pago.metodo.toLowerCase()})`,
          detalle: [
            pago.referencia,
            pago.motivoAnulacion ? `Anulado: ${pago.motivoAnulacion}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
          anulado: pago.anuladoEn !== null,
          montoCentavos: pago.montoCentavos,
          autor: pago.creadoPor.usuario.nombre,
          enlace: `/caja/${pacienteId}`,
        });
      }
    }

    eventos.sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn));

    return {
      paciente: {
        id: paciente.id,
        nombre: `${paciente.nombres} ${paciente.apellidos}`,
      },
      eventos,
      alcance: { clinico: puedeVerClinico, caja: puedeVerCaja },
    };
  });
}
