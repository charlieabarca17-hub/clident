import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  getEstadoCuenta,
  listarRealizadosSinCargo,
  registrarPago,
  reversarAplicacion,
} from "@/server/db/caja";
import { clonarCatalogo, listarCatalogo } from "@/server/db/catalogo";
import { crearPaciente } from "@/server/db/pacientes";
import { aceptarPlan, agregarPlanItem, crearPlan, presentarPlan } from "@/server/db/planes";
import { realizarProcedimiento } from "@/server/db/procedimientos";

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

let clinica: Bootstrap;
let ctx: TenantContext;
let pacienteId: string;
let itemOrtodonciaId: string;
let procedimientoResinaId: string;

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
    descuentoCentavos: 0,
    dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
  });
  const conItems = await agregarPlanItem(ctx, {
    planId: plan!.id,
    tratamientoId: brackets,
    diagnosticoId: null,
    descuentoCentavos: 0,
    dientes: [],
  });
  const [itemResina, itemOrto] = conItems!.items;
  itemOrtodonciaId = itemOrto.id;
  await presentarPlan(ctx, plan!.id);
  await aceptarPlan(ctx, { planId: plan!.id, itemIds: [itemResina.id, itemOrto.id] });

  const procedimiento = await realizarProcedimiento(ctx, {
    pacienteId,
    planItemId: itemResina.id,
    realizadoEn: new Date(),
    notasClinicas: null,
    condicionResultante: "OBTURACION",
    dientes: [{ fdi: 26, superficie: "OCLUSAL" }],
  });
  procedimientoResinaId = procedimiento!.id;
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
    const pendientes = await listarRealizadosSinCargo(ctx);
    expect(pendientes.some((p) => p.id === procedimientoResinaId)).toBe(true);
  });
});

describe("cargo con descuento de mostrador y doble cobro imposible", () => {
  it("cobra el procedimiento con descuento y el CHECK verifica la aritmética", async () => {
    const cargo = await crearCargo(ctx, {
      pacienteId,
      descripcion: "Cobro de resina",
      fechaExigibleEn: hoyElSalvador(),
      lineas: [
        {
          procedimientoId: procedimientoResinaId,
          descripcion: null,
          precioOriginalCentavos: 4500,
          descuentoCentavos: 500,
        },
      ],
    });
    expect(cargo!.montoCentavos).toBe(4000);
    expect(cargo!.lineas[0].descuentoCentavos).toBe(500);
    expect(cargo!.estado).toBe("PENDIENTE");
  });

  it("el segundo cobro del mismo procedimiento no encuentra slot", async () => {
    await expect(
      crearCargo(ctx, {
        pacienteId,
        descripcion: "Doble cobro",
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
    ).rejects.toThrow(/ya está cobrado/i);
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
    ).rejects.toThrow(/ya tiene un calendario/i);
  });

  it("con cuotas vigentes, la activación de ortodoncia NO aparece en la lista de trabajo", async () => {
    const procedimiento = await realizarProcedimiento(ctx, {
      pacienteId,
      planItemId: itemOrtodonciaId,
      realizadoEn: new Date(),
      notasClinicas: "Activación mensual.",
      condicionResultante: null,
      dientes: [],
    });
    const pendientes = await listarRealizadosSinCargo(ctx);
    expect(pendientes.some((p) => p.id === procedimiento!.id)).toBe(false);
  });

  it("una cuota con fecha absurda la rechaza el CHECK de rango", async () => {
    await expect(
      crearCargo(ctx, {
        pacienteId,
        descripcion: "Cuota con año equivocado",
        fechaExigibleEn: "2126-01-01",
        lineas: [
          { procedimientoId: null, descripcion: "Cuota", precioOriginalCentavos: 6000, descuentoCentavos: 0 },
        ],
      }),
    ).rejects.toMatchObject({ code: "23514" });
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
    cargoResinaId = cuenta!.cargos.find((c) => c.descripcion === "Cobro de resina")!.id;

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
    await expect(
      aplicarPago(ctx, { pagoId, cargoId: cargoResinaId, montoCentavos: 100 }),
    ).rejects.toMatchObject({ code: expect.anything() });
  });

  it("sobreaplicar por el lado del pago truena en el SEGUNDO contador", async () => {
    // Quedan $60 disponibles del pago; intentar aplicar $70 a una cuota de $60...
    const cuenta = await getEstadoCuenta(ctx, pacienteId);
    const cuota = cuenta!.cargos.find((c) => c.cuotaNumero === 2)!;
    await expect(
      aplicarPago(ctx, { pagoId, cargoId: cuota.id, montoCentavos: 6100 }),
    ).rejects.toMatchObject({ code: expect.anything() });
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
          `INSERT INTO aplicaciones_pago (id, clinica_id, pago_id, cargo_id, monto_centavos,
             reversa_de_aplicacion_id, motivo_reversa, creada_por_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'reversa parcial ilegal', $7)`,
          [
            randomUUID(),
            clinica.clinicaId,
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
    const pendientes = await listarRealizadosSinCargo(ctx);
    expect(pendientes.some((p) => p.id === procedimientoResinaId)).toBe(true);
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

describe("reconciliación — la red del dinero", () => {
  it("las consultas #1, #2 y #4 devuelven cero filas, con datos de verdad", async () => {
    const guarda = await migrator.query("SELECT count(*)::int AS total FROM cargos");
    expect(guarda.rows[0].total).toBeGreaterThan(0);

    const c1 = await migrator.query(
      `SELECT c.id FROM cargos c
       LEFT JOIN aplicaciones_pago a ON a.cargo_id = c.id
       GROUP BY c.id, c.monto_aplicado_centavos
       HAVING c.monto_aplicado_centavos <> COALESCE(SUM(a.monto_centavos), 0)`,
    );
    expect(c1.rows).toEqual([]);

    const c2 = await migrator.query(
      `SELECT p.id FROM pagos p
       LEFT JOIN aplicaciones_pago a ON a.pago_id = p.id
       GROUP BY p.id, p.monto_aplicado_centavos
       HAVING p.monto_aplicado_centavos <> COALESCE(SUM(a.monto_centavos), 0)`,
    );
    expect(c2.rows).toEqual([]);

    const c4 = await migrator.query(
      `SELECT c.id FROM cargos c
       LEFT JOIN lineas_cargo l ON l.cargo_id = c.id
       GROUP BY c.id, c.monto_centavos
       HAVING c.monto_centavos <> COALESCE(SUM(l.monto_centavos), 0)`,
    );
    expect(c4.rows).toEqual([]);
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
