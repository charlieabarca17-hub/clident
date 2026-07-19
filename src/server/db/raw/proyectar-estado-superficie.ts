import "server-only";

import type { TenantTransaction } from "../tenant";

/**
 * ¿Por qué SQL crudo? El camino en vivo de la proyección del odontograma exige
 * un upsert con comparación de TUPLA:
 *
 *   WHERE (ultimo_evento_en, ultimo_evento_creado_en) <= (EXCLUDED..., EXCLUDED...)
 *
 * Prisma no puede expresar ni el `ON CONFLICT ... DO UPDATE ... WHERE` condicional
 * ni la comparación de tupla completa. Y la tupla no es negociable: es el mismo
 * criterio de desempate del reducer (ARQUITECTURA §10.1) — con un solo campo, un
 * evento retroactivo podría pisar uno más nuevo, o el camino en vivo divergiría
 * del rebuild con dos eventos del mismo instante clínico.
 *
 * Solo la usan los tipos de evento ADITIVOS. CONDICION_ANULADA jamás pasa por
 * aquí: se proyecta recalculando la historia completa de la superficie.
 */
export async function proyectarEstadoSuperficie(
  tx: TenantTransaction,
  params: {
    id: string;
    clinicaId: string;
    pacienteId: string;
    fdi: number;
    superficie: string;
    condicion: string;
    tratamientoPendiente: boolean;
    ultimoEventoId: string;
    ultimoEventoEn: Date;
    ultimoEventoCreadoEn: Date;
  },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO estados_superficie (
      id, clinica_id, paciente_id, fdi, superficie, condicion,
      tratamiento_pendiente, ultimo_evento_id, ultimo_evento_en,
      ultimo_evento_creado_en, actualizado_en
    ) VALUES (
      ${params.id}, ${params.clinicaId}, ${params.pacienteId}, ${params.fdi},
      ${params.superficie}::"Superficie", ${params.condicion}::"CondicionDental",
      ${params.tratamientoPendiente}, ${params.ultimoEventoId},
      ${params.ultimoEventoEn}, ${params.ultimoEventoCreadoEn}, CURRENT_TIMESTAMP
    )
    ON CONFLICT (clinica_id, paciente_id, fdi, superficie) DO UPDATE SET
      condicion = EXCLUDED.condicion,
      tratamiento_pendiente = EXCLUDED.tratamiento_pendiente,
      ultimo_evento_id = EXCLUDED.ultimo_evento_id,
      ultimo_evento_en = EXCLUDED.ultimo_evento_en,
      ultimo_evento_creado_en = EXCLUDED.ultimo_evento_creado_en,
      actualizado_en = CURRENT_TIMESTAMP
    WHERE (estados_superficie.ultimo_evento_en, estados_superficie.ultimo_evento_creado_en)
      <= (EXCLUDED.ultimo_evento_en, EXCLUDED.ultimo_evento_creado_en)
  `;
}
