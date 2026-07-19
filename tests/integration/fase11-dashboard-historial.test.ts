import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generarFechasCuotasMensuales, hoyElSalvador } from "@/lib/fechas";
import { CrearCitaSchema } from "@/lib/validation/citas";
import { CrearPacienteSchema } from "@/lib/validation/pacientes";
import type { TenantContext } from "@/server/auth/types";
import {
  crearCalendarioCuotas,
  crearCargoDePlan,
  registrarPago,
} from "@/server/db/caja";
import { clonarCatalogo, listarCatalogo } from "@/server/db/catalogo";
import { crearCita } from "@/server/db/citas";
import { db } from "@/server/db/client";
import { getDashboard } from "@/server/db/dashboard";
import { crearDiagnostico } from "@/server/db/diagnosticos";
import { getHistorialPaciente } from "@/server/db/historial";
import { crearMaterial } from "@/server/db/inventario";
import { crearPaciente } from "@/server/db/pacientes";
import { aceptarPlan, agregarPlanItem, crearPlan, presentarPlan } from "@/server/db/planes";
import { realizarProcedimiento } from "@/server/db/procedimientos";

const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL!;
const migrator = new pg.Pool({ connectionString: migrationUrl, max: 2 });

type Bootstrap = { clinicaId: string; usuarioId: string; sucursalId: string; membresiaId: string };

async function crearClinica(nombre: string, correo: string): Promise<Bootstrap> {
  const sql = await readFile("infra/crear-clinica.sql", "utf8");
  const ids = {
    clinicaId: randomUUID(),
    sucursalId: randomUUID(),
    usuarioId: randomUUID(),
    membresiaId: randomUUID(),
    auditoriaId: randomUUID(),
  };
  const resultado = await migrator.query(sql, [
    ids.clinicaId,
    nombre,
    ids.sucursalId,
    ids.usuarioId,
    correo,
    "Administrador de prueba",
    ids.membresiaId,
    ids.auditoriaId,
  ]);
  return { ...ids, usuarioId: resultado.rows[0].usuario_id };
}

let clinica: Bootstrap;
let ctx: TenantContext;
let ctxRecepcion: TenantContext;
let pacienteId: string;

beforeAll(async () => {
  clinica = await crearClinica("Tablero A", "tablero-a@clident.test");
  ctx = {
    usuarioId: clinica.usuarioId,
    clinicaId: clinica.clinicaId,
    membresiaId: clinica.membresiaId,
    roles: ["ADMINISTRADOR", "ODONTOLOGO", "CAJA"],
  };
  ctxRecepcion = { ...ctx, roles: ["RECEPCION"] };

  // La membresía del bootstrap nace como ADMINISTRADOR, y agendar exige el rol
  // ODONTOLOGO (la agenda no acepta a cualquiera como profesional tratante).
  await migrator.query(
    `UPDATE membresias SET roles = ARRAY['ADMINISTRADOR','ODONTOLOGO']::"Rol"[]
      WHERE id = $1 AND clinica_id = $2`,
    [clinica.membresiaId, clinica.clinicaId],
  );

  await clonarCatalogo(ctx);
  const tratamientos = (await listarCatalogo(ctx)).flatMap((c) => c.tratamientos);
  const resinaId = tratamientos.find((t) => t.codigo === "RES-01")!.id;
  const brackets = tratamientos.find((t) => t.codigo === "ORT-02")!.id;

  const paciente = await crearPaciente(
    ctxRecepcion,
    CrearPacienteSchema.parse({
      nombres: "Paciente",
      apellidos: "Historial",
      fechaNacimiento: "1990-02-14",
      dui: "",
      telefono: "7500-0001",
      correo: "",
      direccion: "",
      responsable: null,
      contactoEmergencia: { nombre: "Contacto", telefono: "7500-0002" },
    }),
  );
  pacienteId = paciente.id;

  // Una cita hoy.
  const hoy = hoyElSalvador();
  await crearCita(
    ctx,
    CrearCitaSchema.parse({
      pacienteId,
      odontologoId: clinica.membresiaId,
      fecha: hoy,
      hora: "15:00",
      duracionMinutos: 60,
      motivo: "Control",
      notasAdministrativas: "",
    }),
  );

  // Recorrido clínico completo.
  await crearDiagnostico(ctx, {
    pacienteId,
    descripcion: "Caries en el 26",
    notas: null,
    alcance: "DIENTE",
    dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
  });

  const plan = await crearPlan(ctx, { pacienteId, titulo: "Plan del historial" });
  await agregarPlanItem(ctx, {
    planId: plan!.id,
    tratamientoId: resinaId,
    diagnosticoId: null,
    precioAcordadoCentavos: 4500,
    descuentoCentavos: 0,
    dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
  });
  const conItems = await agregarPlanItem(ctx, {
    planId: plan!.id,
    tratamientoId: brackets,
    diagnosticoId: null,
    precioAcordadoCentavos: 108000,
    descuentoCentavos: 0,
    dientes: [],
  });
  const [itemResina, itemOrto] = conItems!.items;
  await presentarPlan(ctx, plan!.id);
  await aceptarPlan(ctx, { planId: plan!.id, itemIds: [itemResina.id, itemOrto.id] });

  await realizarProcedimiento(ctx, {
    pacienteId,
    planItemId: itemResina.id,
    realizadoEn: new Date(),
    notasClinicas: "Resina A2.",
    condicionResultante: "OBTURACION",
    dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
  });

  await crearCargoDePlan(ctx, {
    pacienteId,
    planItemId: itemResina.id,
    fechaExigibleEn: hoy,
  });
  await registrarPago(ctx, {
    pacienteId,
    montoCentavos: 2000,
    metodo: "EFECTIVO",
    referencia: null,
  });

  // Cuotas: 17 futuras + 1 de hoy, para probar exigible vs total cargado.
  await crearCalendarioCuotas(ctx, {
    pacienteId,
    planItemId: itemOrto.id,
    montoCuotaCentavos: 6000,
    fechas: generarFechasCuotasMensuales(hoy, 18),
  });

  await crearMaterial(ctx, {
    nombre: "Guantes de nitrilo",
    unidad: "caja",
    stockActual: 1,
    stockMinimo: 5,
    costoUnitarioCentavos: null,
  });
});

afterAll(async () => {
  await Promise.all([migrator.end(), db.$disconnect()]);
});

describe("dashboard", () => {
  it("cuentas por cobrar es el EXIGIBLE, no el total cargado (ADR-013)", async () => {
    const tablero = await getDashboard(ctx);
    // Exigible: cuota 1 ($60) + cargo de resina ($45) = $105.
    expect(tablero.cuentasPorCobrarCentavos).toBe(6000 + 4500);
    // El total cargado sería 18 × $60 + $45 = $1,125. NO es lo que se muestra.
    expect(tablero.cuentasPorCobrarCentavos).not.toBe(18 * 6000 + 4500);
    expect(tablero.vencidoCentavos).toBe(0);
  });

  it("muestra la agenda del día, los ingresos y las alertas", async () => {
    const tablero = await getDashboard(ctx);
    expect(tablero.citasHoy).toBe(1);
    expect(tablero.citasPendientesHoy).toBe(1);
    expect(tablero.citas).toHaveLength(1);
    expect(tablero.ingresosHoyCentavos).toBe(2000);
    expect(tablero.materialesBajoMinimo).toBe(1);
    // El procedimiento de la resina ya está cobrado.
    expect(tablero.tratamientosSinCargo).toBe(0);
  });

  it("recepción no ve dinero: los campos llegan en null, no filtrados en la UI", async () => {
    const tablero = await getDashboard(ctxRecepcion);
    expect(tablero.cuentasPorCobrarCentavos).toBeNull();
    expect(tablero.ingresosHoyCentavos).toBeNull();
    expect(tablero.tratamientosSinCargo).toBeNull();
    expect(tablero.materialesBajoMinimo).toBeNull();
    // La agenda sí la ve.
    expect(tablero.citasHoy).toBe(1);
  });
});

describe("historial unificado — criterio de salida", () => {
  it("el recorrido completo del paciente cabe en una sola línea de tiempo", async () => {
    const historial = await getHistorialPaciente(ctx, pacienteId);
    const tipos = new Set(historial!.eventos.map((evento) => evento.tipo));
    for (const tipo of ["CITA", "DIAGNOSTICO", "ODONTOGRAMA", "PLAN", "PROCEDIMIENTO", "CARGO", "PAGO"]) {
      expect(tipos.has(tipo as never), tipo).toBe(true);
    }
  });

  it("está ordenado del más reciente al más antiguo", async () => {
    const historial = await getHistorialPaciente(ctx, pacienteId);
    const fechas = historial!.eventos.map((evento) => evento.ocurridoEn);
    expect([...fechas].sort((a, b) => b.localeCompare(a))).toEqual(fechas);
  });

  it("los hitos del plan aparecen con su fecha propia", async () => {
    const historial = await getHistorialPaciente(ctx, pacienteId);
    const hitos = historial!.eventos.filter((evento) => evento.tipo === "PLAN");
    expect(hitos.some((h) => h.titulo.includes("creado"))).toBe(true);
    expect(hitos.some((h) => h.titulo.includes("presentado"))).toBe(true);
    expect(hitos.some((h) => h.titulo.includes("aceptado"))).toBe(true);
  });

  it("recepción ve la agenda pero NO diagnósticos, procedimientos ni dinero", async () => {
    const historial = await getHistorialPaciente(ctxRecepcion, pacienteId);
    const tipos = new Set(historial!.eventos.map((evento) => evento.tipo));
    expect(tipos.has("CITA")).toBe(true);
    expect(tipos.has("DIAGNOSTICO")).toBe(false);
    expect(tipos.has("PROCEDIMIENTO")).toBe(false);
    expect(tipos.has("CARGO")).toBe(false);
    expect(tipos.has("PAGO")).toBe(false);
    expect(historial!.alcance).toEqual({ clinico: false, caja: false });
  });

  it("cross-tenant: otra clínica no alcanza este historial", async () => {
    const otra = await crearClinica("Tablero B", "tablero-b@clident.test");
    const ctxOtra: TenantContext = {
      usuarioId: otra.usuarioId,
      clinicaId: otra.clinicaId,
      membresiaId: otra.membresiaId,
      roles: ["ADMINISTRADOR", "ODONTOLOGO", "CAJA"],
    };
    expect(await getHistorialPaciente(ctxOtra, pacienteId)).toBeNull();
  });
});
