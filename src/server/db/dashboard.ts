import "server-only";

import type { TenantContext } from "@/server/auth/types";
import { tienePermiso } from "@/server/auth/permissions";
import { hoyElSalvador, limitesDelDia } from "@/lib/fechas";

import { kpisDelDia } from "./raw/kpis-dashboard";
import { conTenant } from "./tenant";

/**
 * El tablero es SOLO LECTURA y respeta los permisos del rol: una recepcionista
 * no ve cuentas por cobrar, y quien no tiene permisos clínicos tampoco ve el
 * conteo de procedimientos sin cobrar. Los campos que no corresponden llegan
 * como null — la UI no puede mostrar lo que el repositorio no seleccionó.
 */
export async function getDashboard(ctx: TenantContext) {
  const puedeVerCaja = tienePermiso(ctx.roles, "caja:read");
  const puedeVerInventario = tienePermiso(ctx.roles, "inventario:read");
  const puedeVerAgenda = tienePermiso(ctx.roles, "agenda:read");
  const hoy = hoyElSalvador();
  const { inicio, fin } = limitesDelDia(hoy);

  return conTenant(ctx, async (tx) => {
    const kpis = await kpisDelDia(tx, {
      clinicaId: ctx.clinicaId,
      hoy,
      inicioDia: inicio,
      finDia: fin,
    });

    const citasDeHoy = puedeVerAgenda
      ? await tx.cita.findMany({
          where: {
            clinicaId: ctx.clinicaId,
            inicioEn: { gte: inicio, lt: fin },
          },
          select: {
            id: true,
            inicioEn: true,
            finEn: true,
            estado: true,
            motivo: true,
            paciente: { select: { id: true, nombres: true, apellidos: true } },
            odontologo: { select: { usuario: { select: { nombre: true } } } },
          },
          orderBy: { inicioEn: "asc" },
          take: 50,
        })
      : [];

    return {
      hoy,
      // Los agregados vuelven de SQL como bigint; a la frontera del cliente
      // viajan como number (el tablero de una clínica cabe sin pérdida).
      citasHoy: kpis.citasHoy,
      citasPendientesHoy: kpis.citasPendientesHoy,
      pacientesActivos: kpis.pacientesActivos,
      ingresosHoyCentavos: puedeVerCaja ? Number(kpis.ingresosHoyCentavos) : null,
      cuentasPorCobrarCentavos: puedeVerCaja ? Number(kpis.cuentasPorCobrarCentavos) : null,
      vencidoCentavos: puedeVerCaja ? Number(kpis.vencidoCentavos) : null,
      procedimientosSinCargo: puedeVerCaja ? kpis.procedimientosSinCargo : null,
      materialesBajoMinimo: puedeVerInventario ? kpis.materialesBajoMinimo : null,
      citas: citasDeHoy.map((cita) => ({
        id: cita.id,
        inicioEn: cita.inicioEn.toISOString(),
        finEn: cita.finEn.toISOString(),
        estado: cita.estado,
        motivo: cita.motivo,
        paciente: {
          id: cita.paciente.id,
          nombre: `${cita.paciente.nombres} ${cita.paciente.apellidos}`,
        },
        odontologoNombre: cita.odontologo.usuario.nombre,
      })),
    };
  });
}
