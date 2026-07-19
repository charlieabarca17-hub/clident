-- ADR-017: un tratamiento del plan se cobra una sola vez, aunque tenga
-- múltiples sesiones. Los índices son parciales y se mantienen en SQL porque
-- Prisma no puede expresarlos en el schema.

-- Un PlanItem puede tener un cargo directo vigente O un calendario de cuotas.
-- El índice evita dos cargos directos simultáneos incluso ante concurrencia.
CREATE UNIQUE INDEX "uq_cargo_directo_vigente_por_plan_item"
ON "cargos" ("clinica_id", "plan_item_id")
WHERE "plan_item_id" IS NOT NULL
  AND "cuota_numero" IS NULL
  AND "anulado_en" IS NULL;

-- El precio total acordado se asigna a la primera sesión realizada. Las
-- sesiones posteriores son hechos clínicos incluidos y llevan precio cero.
CREATE UNIQUE INDEX "uq_sesion_con_precio_por_plan_item"
ON "procedimientos" ("clinica_id", "plan_item_id")
WHERE "estado" = 'REALIZADO'
  AND "precio_aplicado_centavos" > 0;
