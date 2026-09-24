import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CONSULTAS_RECONCILIACION } from "../../infra/reconciliar.ts";

import { generarFechasCuotasMensuales, hoyElSalvador } from "@/lib/fechas";
import { CrearPacienteSchema } from "@/lib/validation/pacientes";
import type { TenantContext } from "@/server/auth/types";
import { db } from "@/server/db/client";
import {
  anularCargo,
  anularPago,
  aplicarPago,
  crearCalendarioCuotas,
  crearCargo,
  crearCargoDePlan,
  getEstadoCuenta,
  listarTratamientosRealizadosSinCargo,
  registrarPago,
  reversarAplicacion,
} from "@/server/db/caja";
import { clonarCatalogo, listarCatalogo } from "@/server/db/catalogo";
import { crearPaciente } from "@/server/db/pacientes";
import { getResumenBoca } from "@/server/db/resumen-boca";
import {
  aceptarPlan,
  agregarPlanItem,
  anularPlanItem,
  completarPlanItem,
  crearPlan,
  presentarPlan,
} from "@/server/db/planes";
import { anularProcedimiento, realizarProcedimiento } from "@/server/db/procedimientos";

const appUrl = process.env.TEST_DATABASE_URL!;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL!;
const app = new pg.Pool({ connectionString: appUrl, max: 4 });
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

async function conContexto<T>(
  contexto: { clinicaId?: string },
  operacion: (cliente: PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await app.connect();
  try {
    await cliente.query("BEGIN");
    if (contexto.clinicaId) {
      await cliente.query("SELECT set_config('app.clinica_id', $1, true)", [contexto.clinicaId]);
    }
    const valor = await operacion(cliente);
    await cliente.query("COMMIT");
    return valor;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * Prisma con driver adapter envuelve los errores de PostgreSQL, y el SQLSTATE
 * queda anidado en la causa en vez de en la raíz. Esta función lo busca en
 * cualquier nivel, para que la prueba afirme sobre la regla de la base y no
 * sobre la forma que Prisma le dé al error en cada versión.
 */
function violaRegla(error: unknown, sqlstate?: string): boolean {
  const textos: string[] = [];
  let actual: unknown = error;
  for (let nivel = 0; nivel < 5 && actual; nivel += 1) {
    if (typeof actual !== "object") break;
    const obj = actual as { code?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (sqlstate && obj.code === sqlstate) return true;
    if (typeof obj.message === "string") textos.push(obj.message);
    const meta = obj.meta as { code?: unknown; message?: unknown } | undefined;
    if (sqlstate && meta?.code === sqlstate) return true;
    if (typeof meta?.message === "string") textos.push(meta.message);
    actual = obj.cause;
  }
  const todo = textos.join(" ");
  // 23514 = violación de CHECK. El mensaje de PostgreSQL siempre lo nombra.
  if (sqlstate === "23514") return /violates check constraint/i.test(todo);
  if (sqlstate === "23503") return /violates foreign key constraint/i.test(todo);
  if (sqlstate === "23505") return /duplicate key|violates unique/i.test(todo);
  if (sqlstate === "42501") return /permission denied/i.test(todo);
  return textos.length > 0;
}

async function rechaza(promesa: Promise<unknown>, sqlstate?: string): Promise<void> {
  let capturado: unknown;
  try {
    await promesa;
  } catch (e) {
    capturado = e;
  }
  expect(capturado, "se esperaba que la base rechazara la operación").toBeDefined();
  expect(violaRegla(capturado, sqlstate), `error inesperado: ${String(capturado)}`).toBe(true);
}

let clinica: Bootstrap;
let ctx: TenantContext;
let pacienteId: string;
let itemResinaId: string;
let itemOrtodonciaId: string;
let procedimientoResinaId: string;
let pacienteMultisesionId: string;
let itemMultisesionId: string;
let preciosSesiones: number[];

beforeAll(async () => {
  clinica = await crearClinica("Caja A", "caja-a@clident.test");
  ctx = {
    usuarioId: clinica.usuarioId,
    clinicaId: clinica.clinicaId,
    membresiaId: clinica.membresiaId,
    roles: ["ADMINISTRADOR", "ODONTOLOGO", "CAJA"],
  };

  await clonarCatalogo(ctx);
  const tratamientos = (await listarCatalogo(ctx)).flatMap((c) => c.tratamientos);
  const resinaId = tratamientos.find((t) => t.codigo === "RES-01")!.id;
  const brackets = tratamientos.find((t) => t.codigo === "ORT-02")!.id;

  const paciente = await crearPaciente(
    { ...ctx, roles: ["RECEPCION"] },
    CrearPacienteSchema.parse({
      nombres: "Paciente",
      apellidos: "Caja",
      fechaNacimiento: "1995-04-12",
      dui: "",
      telefono: "7400-0001",
      correo: "",
      direccion: "",
      responsable: null,
      contactoEmergencia: { nombre: "Contacto", telefono: "7400-0002" },
    }),
  );
  pacienteId = paciente.id;

  // Plan aceptado con una resina (se realizará) y la ortodoncia (para cuotas).
  const plan = await crearPlan(ctx, { pacienteId, titulo: "Plan integral" });
  await agregarPlanItem(ctx, {
    planId: plan!.id,
    tratamientoId: resinaId,
    diagnosticoId: null,
    precioAcordadoCentavos: 4500,
    descuentoCentavos: 500,
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
  itemResinaId = itemResina.id;
  itemOrtodonciaId = itemOrto.id;
  await presentarPlan(ctx, plan!.id);
  await aceptarPlan(ctx, { planId: plan!.id, itemIds: [itemResina.id, itemOrto.id] });

  const procedimientoResina = await realizarProcedimiento(ctx, {
    pacienteId,
    planItemId: itemResina.id,
    realizadoEn: new Date(),
    notasClinicas: null,
    condicionResultante: "OBTURACION",
    dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
  });
  procedimientoResinaId = procedimientoResina!.id;

  const pacienteMultisesion = await crearPaciente(
    { ...ctx, roles: ["RECEPCION"] },
    CrearPacienteSchema.parse({
      nombres: "Paciente",
      apellidos: "Multisesión",
      fechaNacimiento: "1992-06-20",
      dui: "",
      telefono: "7400-0010",
      correo: "",
      direccion: "",
      responsable: null,
      contactoEmergencia: { nombre: "Contacto", telefono: "7400-0011" },
    }),
  );
  pacienteMultisesionId = pacienteMultisesion.id;
  const planMultisesion = await crearPlan(ctx, {
    pacienteId: pacienteMultisesionId,
    titulo: "Tratamiento de $150 total",
  });
  const conTratamiento = await agregarPlanItem(ctx, {
    planId: planMultisesion!.id,
    tratamientoId: brackets,
    diagnosticoId: null,
    precioAcordadoCentavos: 15000,
    descuentoCentavos: 0,
    dientes: [],
  });
  itemMultisesionId = conTratamiento!.items[0].id;
  await presentarPlan(ctx, planMultisesion!.id);
  await aceptarPlan(ctx, { planId: planMultisesion!.id, itemIds: [itemMultisesionId] });
  const primera = await realizarProcedimiento(ctx, {
    pacienteId: pacienteMultisesionId,
    planItemId: itemMultisesionId,
    realizadoEn: new Date(),
    notasClinicas: "Primera sesión.",
    condicionResultante: null,
    dientes: [],
  });
  const segunda = await realizarProcedimiento(ctx, {
    pacienteId: pacienteMultisesionId,
    planItemId: itemMultisesionId,
    realizadoEn: new Date(),
    notasClinicas: "Segunda sesión incluida.",
    condicionResultante: null,
    dientes: [],
  });
  preciosSesiones = [primera!.precioAplicadoCentavos, segunda!.precioAplicadoCentavos];
});

afterAll(async () => {
  await Promise.all([app.end(), migrator.end(), db.$disconnect()]);
});

describe("presupuesto ≠ deuda — criterio de salida", () => {
  it("plan aceptado + procedimiento realizado = CERO deuda registrada", async () => {
    const cuenta = await getEstadoCuenta(ctx, pacienteId);
    expect(cuenta!.saldos.exigibleCentavos).toBe(0);
    expect(cuenta!.saldos.totalCargadoCentavos).toBe(0);
    expect(cuenta!.cargos).toHaveLength(0);
  });

  it("el procedimiento aparece en la lista de trabajo esperando decisión humana", async () => {
    const pendientes = await listarTratamientosRealizadosSinCargo(ctx);
    expect(pendientes.some((p) => p.id === itemResinaId)).toBe(true);
  });
});

describe("tratamiento multisesión con precio total por paciente", () => {
  it("$150 acordados se cobran una sola vez y no $150 por cada sesión", async () => {
    expect(preciosSesiones).toEqual([15000, 0]);

    const pendientes = await listarTratamientosRealizadosSinCargo(ctx, pacienteMultisesionId);
    expect(pendientes.filter((p) => p.id === itemMultisesionId)).toHaveLength(1);
    expect(pendientes.find((p) => p.id === itemMultisesionId)!.precioAcordadoCentavos).toBe(15000);

    const cargo = await crearCargoDePlan(ctx, {
      pacienteId: pacienteMultisesionId,
      planItemId: itemMultisesionId,
      fechaExigibleEn: hoyElSalvador(),
    });
    expect(cargo!.montoCentavos).toBe(15000);

    await expect(
      crearCargoDePlan(ctx, {
        pacienteId: pacienteMultisesionId,
        planItemId: itemMultisesionId,
        fechaExigibleEn: hoyElSalvador(),
      }),
    ).rejects.toThrow(/ya tiene un cobro vigente/i);

    await expect(
      crearCalendarioCuotas(ctx, {
        pacienteId: pacienteMultisesionId,
        planItemId: itemMultisesionId,
        montoCuotaCentavos: 5000,
        fechas: generarFechasCuotasMensuales(hoyElSalvador(), 3),
      }),
    ).rejects.toThrow(/ya tiene un cobro vigente/i);
  });
});

describe("precio acordado en el plan y doble cobro imposible", () => {
  it("cobra una sola vez el total acordado por dentista", async () => {
    const cargo = await crearCargoDePlan(ctx, {
      pacienteId,
      planItemId: itemResinaId,
      fechaExigibleEn: hoyElSalvador(),
    });
    expect(cargo!.montoCentavos).toBe(4000);
    expect(cargo!.lineas[0].descuentoCentavos).toBe(500);
    expect(cargo!.estado).toBe("PENDIENTE");
  });

  it("el segundo cobro del mismo tratamiento se rechaza", async () => {
    await expect(
      crearCargoDePlan(ctx, {
        pacienteId,
        planItemId: itemResinaId,
        fechaExigibleEn: hoyElSalvador(),
      }),
    ).rejects.toThrow(/ya tiene un cobro vigente/i);
  });

  it("el flujo anterior no permite cobrar una sesión por separado", async () => {
    await expect(
      crearCargo(ctx, {
        pacienteId,
        descripcion: "Intento por sesión",
        fechaExigibleEn: hoyElSalvador(),
        lineas: [
          {
            procedimientoId: procedimientoResinaId,
            descripcion: null,
            precioOriginalCentavos: 4500,
            descuentoCentavos: 0,
          },
        ],
      }),
    ).rejects.toThrow(/se cobran por PlanItem/i);
  });

  it("la línea con aritmética rota la rechaza la base aunque la app se salte Zod", async () => {
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, async (cliente) => {
        const cargo = await cliente.query(`SELECT id, paciente_id FROM cargos LIMIT 1`);
        await cliente.query(
          `INSERT INTO lineas_cargo (id, clinica_id, cargo_id, descripcion,
             precio_original_centavos, descuento_centavos, monto_centavos)
           VALUES ($1, $2, $3, 'Aritmética rota', 1000, 100, 950)`,
          [randomUUID(), clinica.clinicaId, cargo.rows[0].id],
        );
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("las 18 cuotas — criterio de salida", () => {
  it("18 cuotas de $60 con una exigible hoy → debe hoy $60, no $1,080", async () => {
    const hoy = hoyElSalvador();
    const fechas = generarFechasCuotasMensuales(hoy, 18);
    const resultado = await crearCalendarioCuotas(ctx, {
      pacienteId,
      planItemId: itemOrtodonciaId,
      montoCuotaCentavos: 6000,
      fechas,
    });
    expect(resultado.cargosCreados).toBe(18);

    const cuenta = await getEstadoCuenta(ctx, pacienteId);
    // Exigible: la cuota 1 (hoy) + el cargo de la resina de la prueba anterior.
    expect(cuenta!.saldos.exigibleCentavos).toBe(6000 + 4000);
    expect(cuenta!.saldos.futuroCentavos).toBe(17 * 6000);
    expect(cuenta!.saldos.totalCargadoCentavos).toBe(18 * 6000 + 4000);
    // Ninguna cuota está vencida: hoy nacen, hoy no están en mora.
    expect(cuenta!.saldos.vencidoCentavos).toBe(0);
  });

  it("el segundo calendario para el mismo tratamiento se rechaza", async () => {
    await expect(
      crearCalendarioCuotas(ctx, {
        pacienteId,
        planItemId: itemOrtodonciaId,
        montoCuotaCentavos: 6000,
        fechas: generarFechasCuotasMensuales(hoyElSalvador(), 3),
      }),
    ).rejects.toThrow(/ya tiene un cobro vigente/i);
  });

  it("con cuotas vigentes, la activación de ortodoncia NO aparece en la lista de trabajo", async () => {
    await realizarProcedimiento(ctx, {
      pacienteId,
      planItemId: itemOrtodonciaId,
      realizadoEn: new Date(),
      notasClinicas: "Activación mensual.",
      condicionResultante: null,
      dientes: [],
    });
    const pendientes = await listarTratamientosRealizadosSinCargo(ctx);
    expect(pendientes.some((p) => p.id === itemOrtodonciaId)).toBe(false);
  });

  it("el repositorio no convierte un día inexistente en otro, aunque lo llamen sin el esquema", async () => {
    await expect(
      crearCargo(ctx, {
        pacienteId,
        descripcion: "Fecha imposible",
        fechaExigibleEn: "2026-02-30",
        lineas: [{ procedimientoId: null, descripcion: "Consulta", precioOriginalCentavos: 1000, descuentoCentavos: 0 }],
      }),
    ).rejects.toThrow(/no existe en el calendario/);
  });

  it("una cuota con fecha absurda la rechaza el CHECK de rango", async () => {
    await rechaza(
      crearCargo(ctx, {
        pacienteId,
        descripcion: "Cuota con año equivocado",
        fechaExigibleEn: "2126-01-01",
        lineas: [
          { procedimientoId: null, descripcion: "Cuota", precioOriginalCentavos: 6000, descuentoCentavos: 0 },
        ],
      }),
      "23514",
    );
  });
});

describe("pagos, aplicaciones y los dos contadores", () => {
  let pagoId: string;
  let cargoResinaId: string;
  let aplicacionId: string;

  it("un pago sin aplicar es crédito a favor, no paga nada solo", async () => {
    const pago = await registrarPago(ctx, {
      pacienteId,
      montoCentavos: 10000,
      metodo: "EFECTIVO",
      referencia: null,
    });
    pagoId = pago!.id;

    const cuenta = await getEstadoCuenta(ctx, pacienteId);
    expect(cuenta!.saldos.creditoAFavorCentavos).toBe(10000);
    // El exigible no se movió: repartir es decisión humana.
    expect(cuenta!.saldos.exigibleCentavos).toBe(10000);
  });

  it("aplicar mueve los dos contadores y el estado del cargo", async () => {
    const cuenta = await getEstadoCuenta(ctx, pacienteId);
    cargoResinaId = cuenta!.cargos.find((c) => c.planItemId === itemResinaId)!.id;

    await aplicarPago(ctx, { pagoId, cargoId: cargoResinaId, montoCentavos: 2500 });
    let relegida = (await getEstadoCuenta(ctx, pacienteId))!;
    let cargo = relegida.cargos.find((c) => c.id === cargoResinaId)!;
    expect(cargo.estado).toBe("PARCIAL");
    expect(cargo.montoAplicadoCentavos).toBe(2500);
    expect(relegida.saldos.creditoAFavorCentavos).toBe(7500);

    await aplicarPago(ctx, { pagoId, cargoId: cargoResinaId, montoCentavos: 1500 });
    relegida = (await getEstadoCuenta(ctx, pacienteId))!;
    cargo = relegida.cargos.find((c) => c.id === cargoResinaId)!;
    expect(cargo.estado).toBe("PAGADO");
    aplicacionId = relegida.pagos[0].aplicaciones[0].id;
  });

  it("sobreaplicar por el lado del cargo truena en el CHECK", async () => {
    await rechaza(
      aplicarPago(ctx, { pagoId, cargoId: cargoResinaId, montoCentavos: 100 }),
      "23514",
    );
  });

  it("sobreaplicar por el lado del pago truena en el SEGUNDO contador", async () => {
    // Quedan $60 disponibles del pago. El cargo tiene que tener lugar de sobra:
    // si no, también saltaría el CHECK del cargo y la prueba pasaría aunque el
    // del pago no existiera. Por eso un cargo propio de $100 y $61 aplicados.
    const holgado = await crearCargo(ctx, {
      pacienteId,
      descripcion: "Cargo con espacio de sobra",
      fechaExigibleEn: hoyElSalvador(),
      lineas: [{ procedimientoId: null, descripcion: "Consulta", precioOriginalCentavos: 10000, descuentoCentavos: 0 }],
    });
    let error: unknown;
    try {
      await aplicarPago(ctx, { pagoId, cargoId: holgado!.id, montoCentavos: 6100 });
    } catch (e) {
      error = e;
    }
    expect(violaRegla(error, "23514")).toBe(true);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})) + String(error)).toMatch(
      /pago_no_sobreaplicado/,
    );
    expect(String(error)).not.toMatch(/cargo_no_sobreaplicado/);
  });

  it("la reversa completa devuelve los contadores y el crédito", async () => {
    const resultado = await reversarAplicacion(ctx, aplicacionId, "Se aplicó al cargo equivocado.");
    expect(resultado).not.toBeNull();

    const cuenta = (await getEstadoCuenta(ctx, pacienteId))!;
    const cargo = cuenta.cargos.find((c) => c.id === cargoResinaId)!;
    expect(cargo.montoAplicadoCentavos).toBe(1500);
    expect(cargo.estado).toBe("PARCIAL");

    // La segunda reversa de la misma aplicación no encuentra objetivo (índice único).
    expect(await reversarAplicacion(ctx, aplicacionId, "Otra vez.")).toBeNull();
  });

  it("la reversa por monto distinto es imposible: la FK quíntuple la rechaza", async () => {
    const cuenta = (await getEstadoCuenta(ctx, pacienteId))!;
    const aplicacionViva = cuenta.pagos[0].aplicaciones.find(
      (a) => a.montoCentavos > 0 && !cuenta.pagos[0].aplicaciones.some((r) => r.reversaDeAplicacionId === a.id),
    )!;
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, (cliente) =>
        cliente.query(
          // `paciente_id` va con el valor CORRECTO a propósito: si faltara, el
           // INSERT moriría en el NOT NULL y esta prueba dejaría de probar la FK
           // quíntuple, que es lo único que le interesa.
          `INSERT INTO aplicaciones_pago (id, clinica_id, paciente_id, pago_id, cargo_id, monto_centavos,
             reversa_de_aplicacion_id, motivo_reversa, creada_por_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'reversa parcial ilegal', $8)`,
          [
            randomUUID(),
            clinica.clinicaId,
            pacienteId,
            pagoId,
            cargoResinaId,
            -(aplicacionViva.montoCentavos - 100),
            aplicacionViva.id,
            clinica.membresiaId,
          ],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("anular con dinero aplicado es imposible; revertir-y-anular libera el procedimiento", async () => {
    // El cargo de la resina aún tiene $15 aplicados.
    await expect(anularCargo(ctx, cargoResinaId, "Intento con dinero aplicado.")).rejects.toThrow(
      /reversá/i,
    );

    const cuenta = (await getEstadoCuenta(ctx, pacienteId))!;
    const aplicacionViva = cuenta.pagos[0].aplicaciones.find(
      (a) => a.montoCentavos > 0 && a.cargoId === cargoResinaId &&
        !cuenta.pagos[0].aplicaciones.some((r) => r.reversaDeAplicacionId === a.id),
    )!;
    await reversarAplicacion(ctx, aplicacionViva.id, "Para anular el cargo.");
    const anulado = await anularCargo(ctx, cargoResinaId, "Monto equivocado.");
    expect(anulado).not.toBeNull();

    // El procedimiento quedó libre y vuelve a la lista de trabajo (ADR-016 #15).
    const pendientes = await listarTratamientosRealizadosSinCargo(ctx);
    expect(pendientes.some((p) => p.id === itemResinaId)).toBe(true);
  });

  it("anular un pago exige contador en cero", async () => {
    const pagoNuevo = await registrarPago(ctx, {
      pacienteId,
      montoCentavos: 500,
      metodo: "CHEQUE",
      referencia: "CH-001",
    });
    const cuenta = (await getEstadoCuenta(ctx, pacienteId))!;
    const cuota = cuenta.cargos.find((c) => c.cuotaNumero === 3)!;
    await aplicarPago(ctx, { pagoId: pagoNuevo!.id, cargoId: cuota.id, montoCentavos: 500 });

    // Cheque rebotado con dinero aplicado: primero se revierte.
    await expect(anularPago(ctx, pagoNuevo!.id, "Cheque rebotado.")).rejects.toThrow(/reversá/i);
    const relegida = (await getEstadoCuenta(ctx, pacienteId))!;
    const aplicacion = relegida.pagos.find((p) => p.id === pagoNuevo!.id)!.aplicaciones[0];
    await reversarAplicacion(ctx, aplicacion.id, "Cheque rebotado.");
    const anulado = await anularPago(ctx, pagoNuevo!.id, "Cheque rebotado.");
    expect(anulado).not.toBeNull();

    // El pago anulado ya no aporta crédito a favor.
    const final = (await getEstadoCuenta(ctx, pacienteId))!;
    expect(final.pagos.find((p) => p.id === pagoNuevo!.id)!.anuladoEn).not.toBeNull();
  });
});

describe("un pago no cruza de paciente — hallazgos #1 de la auditoría del 21-sep-2026", () => {
  it("aplicar el pago de un paciente al cargo de otro se rechaza con un mensaje legible", async () => {
    const pagoDeUno = await registrarPago(ctx, {
      pacienteId,
      montoCentavos: 5000,
      metodo: "EFECTIVO",
      referencia: null,
    });
    const cuentaDelOtro = (await getEstadoCuenta(ctx, pacienteMultisesionId))!;
    const cargoDelOtro = cuentaDelOtro.cargos.find((c) => c.anuladoEn === null)!;
    expect(cargoDelOtro, "el otro paciente necesita un cargo vigente para esta prueba").toBeDefined();

    await expect(
      aplicarPago(ctx, {
        pagoId: pagoDeUno!.id,
        cargoId: cargoDelOtro.id,
        montoCentavos: 100,
      }),
    ).rejects.toThrow(/pacientes distintos/i);
  });

  it("y aunque la aplicación se saltara esa guarda, la FK compuesta lo impide en la base", async () => {
    const pagoDeUno = await registrarPago(ctx, {
      pacienteId,
      montoCentavos: 5000,
      metodo: "EFECTIVO",
      referencia: null,
    });
    const cuentaDelOtro = (await getEstadoCuenta(ctx, pacienteMultisesionId))!;
    const cargoDelOtro = cuentaDelOtro.cargos.find((c) => c.anuladoEn === null)!;

    // El INSERT dice que la aplicación es del paciente del cargo, pero apunta al
    // pago del otro. Es exactamente la fila que antes entraba sin que nada
    // chillara, y que dejaba las cinco reconciliaciones en cero.
    await expect(
      conContexto({ clinicaId: clinica.clinicaId }, (cliente) =>
        cliente.query(
          `INSERT INTO aplicaciones_pago (id, clinica_id, paciente_id, pago_id, cargo_id, monto_centavos, creada_por_id)
           VALUES ($1, $2, $3, $4, $5, 100, $6)`,
          [
            randomUUID(),
            clinica.clinicaId,
            pacienteMultisesionId,
            pagoDeUno!.id,
            cargoDelOtro.id,
            clinica.membresiaId,
          ],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
});

describe("reconciliación — la red del dinero", () => {
  it("las cinco consultas de infra/reconciliar.ts devuelven cero filas, con datos de verdad", async () => {
    // Las consultas NO se copian acá: se importan del script que corre en
    // producción. Una copia se desincroniza del original y la suite termina
    // verificando una consulta que ya no existe (ARQUITECTURA §13.4).
    const guarda = await migrator.query(
      "SELECT (SELECT count(*)::int FROM cargos) AS cargos, (SELECT count(*)::int FROM pagos) AS pagos",
    );
    expect(guarda.rows[0].cargos).toBeGreaterThan(0);
    expect(guarda.rows[0].pagos).toBeGreaterThan(0);

    // El control #5 pasaría por vacío si nadie hubiera anulado nada: sin filas
    // de auditoría con esas acciones, no hay resurrección posible que encontrar.
    const anulaciones = await migrator.query(
      `SELECT DISTINCT accion FROM auditoria
       WHERE accion IN ('CARGO_ANULADO', 'PAGO_ANULADO')`,
    );
    expect(anulaciones.rows.map((f) => f.accion).sort()).toEqual([
      "CARGO_ANULADO",
      "PAGO_ANULADO",
    ]);

    // Si alguien borra una consulta del script, esto falla en vez de bajar la
    // cobertura en silencio.
    expect(CONSULTAS_RECONCILIACION).toHaveLength(5);

    for (const consulta of CONSULTAS_RECONCILIACION) {
      const resultado = await migrator.query(consulta.sql);
      expect(resultado.rows, `${consulta.nombre}: devolvió filas descuadradas`).toEqual([]);
    }
  });

  it("la app no puede editar ni borrar dinero descompuesto ni aplicado", async () => {
    for (const consulta of [
      "UPDATE lineas_cargo SET monto_centavos = 1",
      "DELETE FROM lineas_cargo",
      "UPDATE aplicaciones_pago SET monto_centavos = 1",
      "DELETE FROM aplicaciones_pago",
      "UPDATE cargos SET monto_centavos = 1",
      "UPDATE pagos SET monto_centavos = 1",
      "DELETE FROM cargos",
      "DELETE FROM pagos",
    ]) {
      await expect(
        conContexto({ clinicaId: clinica.clinicaId }, (cliente) => cliente.query(consulta)),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });
});

// ---------------------------------------------------------------------------
// El vistazo de la boca en la ficha del paciente (Ciclo 28).
//
// Es una lectura agregada: no escribe nada y no interpreta nada. Lo que se
// verifica acá es que diga la verdad sobre lo ya registrado — que una pieza con
// procedimiento REALIZADO aparezca como tratada, que un presupuesto no cuente
// como compromiso, y que no cruce clínicas.
// ---------------------------------------------------------------------------
describe("resumen de la boca para la ficha", () => {
  it("una pieza con procedimiento realizado aparece tratada, con el nombre del tratamiento", async () => {
    const resumen = (await getResumenBoca(ctx, pacienteId))!;
    expect(resumen).not.toBeNull();

    // La resina de la fase se realizó sobre el 26 oclusal.
    const pieza26 = resumen.piezas.find((p) => p.fdi === 26);
    expect(pieza26, "el 26 debería figurar: tuvo un procedimiento realizado").toBeDefined();
    expect(pieza26!.tratada).toBe(true);
    expect(pieza26!.tratamientosHechos.length).toBeGreaterThan(0);
    expect(resumen.totalTratadas).toBeGreaterThan(0);
  });

  it("el conteo de tratadas coincide con las piezas marcadas como tratadas", async () => {
    const resumen = (await getResumenBoca(ctx, pacienteId))!;
    expect(resumen.totalTratadas).toBe(resumen.piezas.filter((p) => p.tratada).length);
    expect(resumen.totalConHallazgo).toBe(
      resumen.piezas.filter((p) => p.condiciones.length > 0).length,
    );
    // Una pieza ya tratada no se cuenta además como "aceptada sin realizar".
    for (const pieza of resumen.piezas) {
      if (pieza.tratada) expect(resumen.piezas.filter((p) => p.fdi === pieza.fdi)).toHaveLength(1);
    }
  });

  it("no cruza clínicas: el paciente de otra clínica no existe acá", async () => {
    const ctxOtraClinica: TenantContext = {
      usuarioId: clinica.usuarioId,
      clinicaId: randomUUID(),
      membresiaId: clinica.membresiaId,
      roles: ["ODONTOLOGO"],
    };
    expect(await getResumenBoca(ctxOtraClinica, pacienteId)).toBeNull();
  });

  it("exige permiso clínico: Caja no ve la boca del paciente", async () => {
    await expect(
      getResumenBoca({ ...ctx, roles: ["CAJA"] }, pacienteId),
    ).rejects.toThrow(/permiso/i);
  });
});

describe("un procedimiento cobrado no se anula dejando el cobro sin tratamiento — CLAUDE.md §9", () => {
  // Paciente propio: estas pruebas anulan procedimientos y cargos, y no deben
  // mover nada de lo que el resto del archivo da por sentado.
  let pacienteAnulacionId: string;
  let tratamientoMultiId: string;

  async function planAceptado(precioCentavos: number) {
    const plan = await crearPlan(ctx, { pacienteId: pacienteAnulacionId, titulo: "Anulación" });
    const conItem = await agregarPlanItem(ctx, {
      planId: plan!.id,
      tratamientoId: tratamientoMultiId,
      diagnosticoId: null,
      precioAcordadoCentavos: precioCentavos,
      descuentoCentavos: 0,
      dientes: [],
    });
    const itemId = conItem!.items[0].id;
    await presentarPlan(ctx, plan!.id);
    await aceptarPlan(ctx, { planId: plan!.id, itemIds: [itemId] });
    return itemId;
  }

  async function sesion(planItemId: string) {
    const creada = await realizarProcedimiento(ctx, {
      pacienteId: pacienteAnulacionId,
      planItemId,
      realizadoEn: new Date(),
      notasClinicas: null,
      condicionResultante: null,
      dientes: [],
    });
    return creada!.id;
  }

  beforeAll(async () => {
    const tratamientos = (await listarCatalogo(ctx)).flatMap((c) => c.tratamientos);
    tratamientoMultiId = tratamientos.find((t) => t.codigo === "ORT-02")!.id;
    const paciente = await crearPaciente(
      { ...ctx, roles: ["RECEPCION"] },
      CrearPacienteSchema.parse({
        nombres: "Paciente",
        apellidos: "Anulación",
        fechaNacimiento: "1990-01-15",
        dui: "",
        telefono: "7400-0030",
        correo: "",
        direccion: "",
        responsable: null,
        contactoEmergencia: { nombre: "Contacto", telefono: "7400-0031" },
      }),
    );
    pacienteAnulacionId = paciente.id;
  });

  it("con cobro directo vigente, la única sesión realizada no se puede anular", async () => {
    const itemId = await planAceptado(5000);
    const unica = await sesion(itemId);
    const cargo = await crearCargoDePlan(ctx, {
      pacienteId: pacienteAnulacionId,
      planItemId: itemId,
      fechaExigibleEn: hoyElSalvador(),
    });

    await expect(anularProcedimiento(ctx, unica, "Pieza equivocada.")).rejects.toThrow(/cobro vigente/i);
    const { rows } = await migrator.query<{ estado: string }>(
      "SELECT estado FROM procedimientos WHERE plan_item_id = $1",
      [itemId],
    );
    expect(rows.map((r) => r.estado)).toEqual(["REALIZADO"]);

    // El orden correcto: primero Caja anula el cargo, después se anula el hecho.
    await anularCargo(ctx, cargo!.id, "Se cobró un tratamiento mal registrado.");
    const anulado = await anularProcedimiento(ctx, unica, "Pieza equivocada.");
    expect(anulado!.estado).toBe("ANULADO");
  });

  it("con varias sesiones se puede anular una, pero nunca la última que sostiene el cobro", async () => {
    const itemId = await planAceptado(15000);
    const primera = await sesion(itemId);
    const segunda = await sesion(itemId);
    await crearCargoDePlan(ctx, {
      pacienteId: pacienteAnulacionId,
      planItemId: itemId,
      fechaExigibleEn: hoyElSalvador(),
    });

    // Anular la primera deja la segunda realizada: el cobro sigue teniendo tratamiento.
    const anulada = await anularProcedimiento(ctx, primera, "Sesión duplicada.");
    expect(anulada!.estado).toBe("ANULADO");
    await expect(anularProcedimiento(ctx, segunda, "Tampoco.")).rejects.toThrow(/cobro vigente/i);
  });

  it("anular espera el candado del tratamiento: no se cruza con un cobro simultáneo", async () => {
    // Otra conexión retiene el MISMO candado que toma Caja al cobrar. Si
    // anularProcedimiento no lo pidiera, terminaría sin esperar y podría
    // intercalarse con crearCargoDePlan: cobro creado + única sesión anulada.
    const itemId = await planAceptado(2000);
    const unica = await sesion(itemId);
    const bloqueo = await migrator.connect();
    try {
      await bloqueo.query("BEGIN");
      await bloqueo.query("SELECT id FROM plan_items WHERE id = $1 FOR UPDATE", [itemId]);
      const pidBloqueo = (await bloqueo.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      let termino = false;
      const anulacion = anularProcedimiento(ctx, unica, "Registro equivocado.").finally(() => {
        termino = true;
      });
      // No se mide un reloj (la latencia de la red lo vuelve inútil): se le
      // pregunta a PostgreSQL si alguna sesión está BLOQUEADA por la que retiene
      // el candado. Sin el candado, la anulación termina sin que eso ocurra nunca.
      let esperando = false;
      for (let intento = 0; intento < 100 && !esperando && !termino; intento += 1) {
        const { rows } = await migrator.query<{ n: string }>(
          "SELECT count(*) AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
          [pidBloqueo],
        );
        esperando = Number(rows[0].n) > 0;
        if (!esperando) await new Promise((resolver) => setTimeout(resolver, 100));
      }
      expect(esperando).toBe(true);
      expect(termino).toBe(false);
      await bloqueo.query("COMMIT");
      expect((await anulacion)!.estado).toBe("ANULADO");
    } finally {
      bloqueo.release();
    }
  });

  it("registrar una sesión también espera el candado: un solo orden de bloqueo", async () => {
    // Sin este candado, registrar y anular sesiones del mismo tratamiento se
    // bloquean en orden inverso (superficies → ítem contra ítem → superficies),
    // y una anulación de ítem podría no ver una sesión que está naciendo.
    const itemId = await planAceptado(2500);
    const bloqueo = await migrator.connect();
    try {
      await bloqueo.query("BEGIN");
      await bloqueo.query("SELECT id FROM plan_items WHERE id = $1 FOR UPDATE", [itemId]);
      const pidBloqueo = (await bloqueo.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      let termino = false;
      const registro = sesion(itemId).finally(() => {
        termino = true;
      });
      let esperando = false;
      for (let intento = 0; intento < 100 && !esperando && !termino; intento += 1) {
        const { rows } = await migrator.query<{ n: string }>(
          "SELECT count(*) AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
          [pidBloqueo],
        );
        esperando = Number(rows[0].n) > 0;
        if (!esperando) await new Promise((resolver) => setTimeout(resolver, 100));
      }
      expect(esperando).toBe(true);
      // Esperar no alcanza: sin el candado, la sesión igual terminaría esperando,
      // pero DESPUÉS de insertar el procedimiento (el FK y el cambio de estado del
      // ítem chocan con la misma fila). Con el candado, espera ANTES de tocar nada:
      // todavía no tiene ningún candado sobre `procedimientos`.
      const bloqueadas = await migrator.query<{ pid: number }>(
        "SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
        [pidBloqueo],
      );
      const { rows: tocados } = await migrator.query<{ n: string }>(
        "SELECT count(*) AS n FROM pg_locks WHERE pid = ANY($1) AND relation = 'procedimientos'::regclass",
        [bloqueadas.rows.map((fila) => fila.pid)],
      );
      expect(Number(tocados[0].n)).toBe(0);
      expect(termino).toBe(false);
      await bloqueo.query("COMMIT");
      expect(await registro).toBeTruthy();
    } finally {
      bloqueo.release();
    }
  });

  it("sin cobro, anular sigue siendo libre", async () => {
    const itemId = await planAceptado(3000);
    const unica = await sesion(itemId);
    const anulado = await anularProcedimiento(ctx, unica, "Registro equivocado.");
    expect(anulado!.estado).toBe("ANULADO");
  });
});

describe("ANULADO dice 'nunca existió': no se le aplica a un tratamiento con hechos o cobro — REGLAS §4.5", () => {
  let pacienteItemsId: string;
  let tratamientoMultiId: string;

  async function itemAceptado(precioCentavos: number) {
    const plan = await crearPlan(ctx, { pacienteId: pacienteItemsId, titulo: "Anular ítem" });
    const conItem = await agregarPlanItem(ctx, {
      planId: plan!.id,
      tratamientoId: tratamientoMultiId,
      diagnosticoId: null,
      precioAcordadoCentavos: precioCentavos,
      descuentoCentavos: 0,
      dientes: [],
    });
    const itemId = conItem!.items[0].id;
    await presentarPlan(ctx, plan!.id);
    await aceptarPlan(ctx, { planId: plan!.id, itemIds: [itemId] });
    return itemId;
  }

  beforeAll(async () => {
    const tratamientos = (await listarCatalogo(ctx)).flatMap((c) => c.tratamientos);
    tratamientoMultiId = tratamientos.find((t) => t.codigo === "ORT-02")!.id;
    const paciente = await crearPaciente(
      { ...ctx, roles: ["RECEPCION"] },
      CrearPacienteSchema.parse({
        nombres: "Paciente",
        apellidos: "Ítems anulados",
        fechaNacimiento: "1987-11-03",
        dui: "",
        telefono: "7400-0040",
        correo: "",
        direccion: "",
        responsable: null,
        contactoEmergencia: { nombre: "Contacto", telefono: "7400-0041" },
      }),
    );
    pacienteItemsId = paciente.id;
  });

  it("un ítem con una sesión realizada no se anula: el hecho se corrige en el procedimiento", async () => {
    const itemId = await itemAceptado(9000);
    await realizarProcedimiento(ctx, {
      pacienteId: pacienteItemsId,
      planItemId: itemId,
      realizadoEn: new Date(),
      notasClinicas: null,
      condicionResultante: null,
      dientes: [],
    });
    await completarPlanItem(ctx, itemId);
    await expect(anularPlanItem(ctx, itemId, "Nunca ocurrió.")).rejects.toThrow(/procedimiento realizado/i);
    const { rows } = await migrator.query<{ estado: string }>("SELECT estado FROM plan_items WHERE id = $1", [itemId]);
    expect(rows[0].estado).toBe("COMPLETADO");
  });

  it("un ítem con cobro vigente no se anula, aunque no tenga sesiones: primero Caja", async () => {
    const itemId = await itemAceptado(12000);
    await crearCalendarioCuotas(ctx, {
      pacienteId: pacienteItemsId,
      planItemId: itemId,
      montoCuotaCentavos: 6000,
      fechas: generarFechasCuotasMensuales(hoyElSalvador(), 2),
    });
    await completarPlanItem(ctx, itemId);
    await expect(anularPlanItem(ctx, itemId, "Marcado por error.")).rejects.toThrow(/cobro vigente/i);
  });

  it("marcado completado por error, sin hechos ni cobro: se anula", async () => {
    const itemId = await itemAceptado(3000);
    await completarPlanItem(ctx, itemId);
    const anulado = await anularPlanItem(ctx, itemId, "Se marcó la fila equivocada.");
    expect(anulado!.items.find((i) => i.id === itemId)!.estado).toBe("ANULADO");
  });
});
