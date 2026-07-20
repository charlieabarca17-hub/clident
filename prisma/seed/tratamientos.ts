// Referencia odontológica global (ARQUITECTURA.md §2, §10.4). Cada clínica elige
// únicamente los tratamientos que ofrece y puede nombrarlos como los conoce.
// La referencia no incluye precios: el odontólogo fija el total en cada plan.
//
// Las banderas siguen §4.7: NO existe "resina oclusal" ni "resina mesial" como
// fila — hay UNA "Restauración con resina" y las superficies se eligen al asignarla.

import pg from "pg";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PLANTILLAS_CATEGORIA } from "./categorias.ts";

type Alcance = "DIENTE" | "BOCA";

export type PlantillaTratamientoSemilla = {
  codigo: string;
  categoriaId: string;
  nombre: string;
  alcance: Alcance;
  requiereDiente: boolean;
  permiteMultiplesDientes: boolean;
  permiteSuperficies: boolean;
  permiteMultiplesSuperficies: boolean;
  requiereDiagnostico: boolean;
  permiteMultiplesSesiones: boolean;
};

type Banderas = Partial<
  Pick<
    PlantillaTratamientoSemilla,
    | "requiereDiente"
    | "permiteMultiplesDientes"
    | "permiteSuperficies"
    | "permiteMultiplesSuperficies"
    | "requiereDiagnostico"
    | "permiteMultiplesSesiones"
  >
>;

// Base conservadora: un tratamiento DIENTE exige pieza; uno BOCA no la admite.
// Todo lo demás se activa explícitamente por tratamiento.
function plantilla(
  codigo: string,
  categoriaId: string,
  nombre: string,
  alcance: Alcance,
  banderas: Banderas = {},
): PlantillaTratamientoSemilla {
  return {
    codigo,
    categoriaId,
    nombre,
    alcance,
    requiereDiente: alcance === "DIENTE",
    permiteMultiplesDientes: false,
    permiteSuperficies: false,
    permiteMultiplesSuperficies: false,
    requiereDiagnostico: false,
    permiteMultiplesSesiones: false,
    ...banderas,
  };
}

export const PLANTILLAS_TRATAMIENTO: readonly PlantillaTratamientoSemilla[] = [
  // ── Diagnóstico y consulta ──
  plantilla("DIA-01", "diagnostico", "Consulta de primera vez", "BOCA"),
  plantilla("DIA-02", "diagnostico", "Consulta de control", "BOCA"),
  plantilla("DIA-03", "diagnostico", "Consulta de emergencia", "BOCA"),
  plantilla("DIA-04", "diagnostico", "Evaluación diagnóstica integral", "BOCA"),
  plantilla("DIA-05", "diagnostico", "Radiografía periapical", "DIENTE"),
  plantilla("DIA-06", "diagnostico", "Radiografía de aleta de mordida", "BOCA"),
  plantilla("DIA-07", "diagnostico", "Radiografía panorámica (referida)", "BOCA"),
  plantilla("DIA-08", "diagnostico", "Fotografías intraorales", "BOCA"),

  // ── Preventiva ──
  plantilla("PRE-01", "preventiva", "Profilaxis (limpieza) adulto", "BOCA"),
  plantilla("PRE-02", "preventiva", "Profilaxis infantil", "BOCA"),
  plantilla("PRE-03", "preventiva", "Aplicación tópica de flúor", "BOCA"),
  plantilla("PRE-04", "preventiva", "Sellante de fosas y fisuras", "DIENTE", {
    permiteMultiplesDientes: true,
  }),
  plantilla("PRE-05", "preventiva", "Detartraje supragingival", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("PRE-06", "preventiva", "Educación en higiene oral", "BOCA"),
  plantilla("PRE-07", "preventiva", "Férula de descarga nocturna", "BOCA"),
  plantilla("PRE-08", "preventiva", "Barniz de flúor por pieza", "DIENTE", {
    permiteMultiplesDientes: true,
  }),

  // ── Restaurativa ──
  plantilla("RES-01", "restaurativa", "Restauración con resina", "DIENTE", {
    permiteSuperficies: true,
    permiteMultiplesSuperficies: true,
  }),
  plantilla("RES-02", "restaurativa", "Restauración con ionómero de vidrio", "DIENTE", {
    permiteSuperficies: true,
    permiteMultiplesSuperficies: true,
  }),
  plantilla("RES-03", "restaurativa", "Restauración con amalgama", "DIENTE", {
    permiteSuperficies: true,
    permiteMultiplesSuperficies: true,
  }),
  plantilla("RES-04", "restaurativa", "Reconstrucción de ángulo incisal", "DIENTE", {
    permiteSuperficies: true,
    permiteMultiplesSuperficies: true,
  }),
  plantilla("RES-05", "restaurativa", "Reconstrucción con poste de fibra de vidrio", "DIENTE", {
    requiereDiagnostico: true,
  }),
  plantilla("RES-06", "restaurativa", "Base cavitaria protectora", "DIENTE", {
    permiteSuperficies: true,
  }),
  plantilla("RES-07", "restaurativa", "Pulido y ajuste de restauración", "DIENTE", {
    permiteSuperficies: true,
  }),
  plantilla("RES-08", "restaurativa", "Restauración temporal", "DIENTE", {
    permiteSuperficies: true,
    permiteMultiplesSuperficies: true,
  }),

  // ── Endodoncia ──
  plantilla("END-01", "endodoncia", "Endodoncia unirradicular", "DIENTE", {
    requiereDiagnostico: true,
    permiteMultiplesSesiones: true,
  }),
  plantilla("END-02", "endodoncia", "Endodoncia birradicular", "DIENTE", {
    requiereDiagnostico: true,
    permiteMultiplesSesiones: true,
  }),
  plantilla("END-03", "endodoncia", "Endodoncia multirradicular", "DIENTE", {
    requiereDiagnostico: true,
    permiteMultiplesSesiones: true,
  }),
  plantilla("END-04", "endodoncia", "Retratamiento de conductos", "DIENTE", {
    requiereDiagnostico: true,
    permiteMultiplesSesiones: true,
  }),
  plantilla("END-05", "endodoncia", "Pulpotomía", "DIENTE", { requiereDiagnostico: true }),
  plantilla("END-06", "endodoncia", "Pulpectomía", "DIENTE", { requiereDiagnostico: true }),
  plantilla("END-07", "endodoncia", "Recubrimiento pulpar directo", "DIENTE", {
    requiereDiagnostico: true,
  }),
  plantilla("END-08", "endodoncia", "Apicectomía", "DIENTE", { requiereDiagnostico: true }),

  // ── Periodoncia ──
  plantilla("PER-01", "periodoncia", "Detartraje subgingival por cuadrante", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("PER-02", "periodoncia", "Alisado radicular por cuadrante", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("PER-03", "periodoncia", "Curetaje periodontal", "BOCA", {
    requiereDiagnostico: true,
    permiteMultiplesSesiones: true,
  }),
  plantilla("PER-04", "periodoncia", "Cirugía periodontal por cuadrante", "BOCA", {
    requiereDiagnostico: true,
    permiteMultiplesSesiones: true,
  }),
  plantilla("PER-05", "periodoncia", "Gingivectomía", "DIENTE", {
    permiteMultiplesDientes: true,
    requiereDiagnostico: true,
  }),
  plantilla("PER-06", "periodoncia", "Alargamiento de corona clínica", "DIENTE", {
    requiereDiagnostico: true,
  }),
  plantilla("PER-07", "periodoncia", "Injerto gingival", "DIENTE", {
    requiereDiagnostico: true,
  }),
  plantilla("PER-08", "periodoncia", "Mantenimiento periodontal", "BOCA", {
    permiteMultiplesSesiones: true,
  }),

  // ── Cirugía oral ──
  plantilla("CIR-01", "cirugia", "Extracción simple", "DIENTE"),
  plantilla("CIR-02", "cirugia", "Extracción de resto radicular", "DIENTE"),
  plantilla("CIR-03", "cirugia", "Extracción quirúrgica", "DIENTE"),
  plantilla("CIR-04", "cirugia", "Extracción de tercera molar erupcionada", "DIENTE"),
  plantilla("CIR-05", "cirugia", "Extracción de tercera molar retenida", "DIENTE"),
  plantilla("CIR-06", "cirugia", "Frenectomía", "BOCA"),
  plantilla("CIR-07", "cirugia", "Biopsia de tejido blando", "BOCA"),
  plantilla("CIR-08", "cirugia", "Drenaje de absceso", "BOCA"),
  plantilla("CIR-09", "cirugia", "Regularización de reborde alveolar", "BOCA"),

  // ── Prótesis fija ──
  plantilla("PRF-01", "protesis-fija", "Corona de porcelana sobre metal", "DIENTE", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("PRF-02", "protesis-fija", "Corona libre de metal (zirconio)", "DIENTE", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("PRF-03", "protesis-fija", "Corona provisional", "DIENTE"),
  plantilla("PRF-04", "protesis-fija", "Incrustación (inlay/onlay)", "DIENTE", {
    permiteSuperficies: true,
    permiteMultiplesSuperficies: true,
    permiteMultiplesSesiones: true,
  }),
  plantilla("PRF-05", "protesis-fija", "Carilla de porcelana", "DIENTE", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("PRF-06", "protesis-fija", "Puente fijo, por unidad", "DIENTE", {
    permiteMultiplesDientes: true,
    permiteMultiplesSesiones: true,
  }),
  plantilla("PRF-07", "protesis-fija", "Recementación de corona o puente", "DIENTE", {
    permiteMultiplesDientes: true,
  }),
  plantilla("PRF-08", "protesis-fija", "Retiro de corona o puente", "DIENTE", {
    permiteMultiplesDientes: true,
  }),

  // ── Prótesis removible ──
  plantilla("PRR-01", "protesis-removible", "Prótesis total superior", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("PRR-02", "protesis-removible", "Prótesis total inferior", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("PRR-03", "protesis-removible", "Prótesis parcial removible acrílica", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("PRR-04", "protesis-removible", "Prótesis parcial removible metálica", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("PRR-05", "protesis-removible", "Prótesis flexible", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("PRR-06", "protesis-removible", "Reparación de prótesis", "BOCA"),
  plantilla("PRR-07", "protesis-removible", "Rebase de prótesis", "BOCA"),
  plantilla("PRR-08", "protesis-removible", "Ajuste de prótesis", "BOCA"),

  // ── Implantología ──
  plantilla("IMP-01", "implantes", "Implante dental unitario", "DIENTE", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("IMP-02", "implantes", "Corona sobre implante", "DIENTE", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("IMP-03", "implantes", "Elevación de seno maxilar", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("IMP-04", "implantes", "Injerto óseo", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("IMP-05", "implantes", "Cirugía de segunda fase", "DIENTE"),
  plantilla("IMP-06", "implantes", "Sobredentadura sobre implantes", "BOCA", {
    permiteMultiplesSesiones: true,
  }),

  // ── Ortodoncia ──
  plantilla("ORT-01", "ortodoncia", "Estudio y diagnóstico ortodóntico", "BOCA"),
  plantilla("ORT-02", "ortodoncia", "Colocación de aparatología fija (brackets)", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("ORT-03", "ortodoncia", "Control mensual de ortodoncia", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("ORT-04", "ortodoncia", "Retiro de aparatología", "BOCA"),
  plantilla("ORT-05", "ortodoncia", "Retenedores (par)", "BOCA"),
  plantilla("ORT-06", "ortodoncia", "Alineadores — fase inicial", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("ORT-07", "ortodoncia", "Aparato ortopédico removible", "BOCA"),
  plantilla("ORT-08", "ortodoncia", "Reposición de bracket", "DIENTE", {
    permiteMultiplesDientes: true,
  }),

  // ── Odontopediatría ──
  plantilla("PED-01", "odontopediatria", "Consulta odontopediátrica", "BOCA"),
  plantilla("PED-02", "odontopediatria", "Profilaxis y flúor infantil", "BOCA"),
  plantilla("PED-03", "odontopediatria", "Sellantes en dentición temporal", "DIENTE", {
    permiteMultiplesDientes: true,
  }),
  plantilla("PED-04", "odontopediatria", "Corona de acero-cromo", "DIENTE"),
  plantilla("PED-05", "odontopediatria", "Pulpotomía en diente temporal", "DIENTE", {
    requiereDiagnostico: true,
  }),
  plantilla("PED-06", "odontopediatria", "Extracción de diente temporal", "DIENTE"),
  plantilla("PED-07", "odontopediatria", "Mantenedor de espacio", "BOCA"),
  plantilla("PED-08", "odontopediatria", "Restauración en diente temporal", "DIENTE", {
    permiteSuperficies: true,
    permiteMultiplesSuperficies: true,
  }),

  // ── Estética dental ──
  plantilla("EST-01", "estetica", "Blanqueamiento en consultorio", "BOCA", {
    permiteMultiplesSesiones: true,
  }),
  plantilla("EST-02", "estetica", "Blanqueamiento ambulatorio (férulas)", "BOCA"),
  plantilla("EST-03", "estetica", "Blanqueamiento de diente no vital", "DIENTE", {
    requiereDiagnostico: true,
  }),
  plantilla("EST-04", "estetica", "Carilla de resina", "DIENTE"),
  plantilla("EST-05", "estetica", "Cierre de diastema", "DIENTE", {
    permiteMultiplesDientes: true,
  }),
  plantilla("EST-06", "estetica", "Contorneado estético", "DIENTE", {
    permiteMultiplesDientes: true,
  }),
  plantilla("EST-07", "estetica", "Microabrasión del esmalte", "DIENTE", {
    permiteMultiplesDientes: true,
  }),
];

/** Siembra idempotente de plantillas globales. Solo el migrador puede escribirlas. */
export async function sembrarCatalogoGlobal(connectionString: string): Promise<void> {
  const cliente = new pg.Client({ connectionString });
  await cliente.connect();

  try {
    await cliente.query("BEGIN");
    await cliente.query(
      `INSERT INTO plantillas_categoria (id, nombre, orden)
       SELECT id, nombre, orden
       FROM jsonb_to_recordset($1::jsonb) AS categoria(id text, nombre text, orden integer)
       ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden`,
      [JSON.stringify(PLANTILLAS_CATEGORIA)],
    );
    await cliente.query(
      `INSERT INTO plantillas_tratamiento (
         codigo, categoria_id, nombre, alcance,
         requiere_diente, permite_multiples_dientes, permite_superficies,
         permite_multiples_superficies, requiere_diagnostico, permite_multiples_sesiones
       )
       SELECT codigo, categoria_id, nombre, alcance::"AlcanceTratamiento",
              requiere_diente, permite_multiples_dientes, permite_superficies,
              permite_multiples_superficies, requiere_diagnostico, permite_multiples_sesiones
       FROM jsonb_to_recordset($1::jsonb) AS plantilla(
         codigo text, categoria_id text, nombre text, alcance text,
         requiere_diente boolean, permite_multiples_dientes boolean,
         permite_superficies boolean, permite_multiples_superficies boolean,
         requiere_diagnostico boolean, permite_multiples_sesiones boolean
       )
       ON CONFLICT (codigo) DO UPDATE SET
         categoria_id = EXCLUDED.categoria_id, nombre = EXCLUDED.nombre,
         alcance = EXCLUDED.alcance, requiere_diente = EXCLUDED.requiere_diente,
         permite_multiples_dientes = EXCLUDED.permite_multiples_dientes,
         permite_superficies = EXCLUDED.permite_superficies,
         permite_multiples_superficies = EXCLUDED.permite_multiples_superficies,
         requiere_diagnostico = EXCLUDED.requiere_diagnostico,
         permite_multiples_sesiones = EXCLUDED.permite_multiples_sesiones`,
      [
        JSON.stringify(
          PLANTILLAS_TRATAMIENTO.map((p) => ({
            codigo: p.codigo,
            categoria_id: p.categoriaId,
            nombre: p.nombre,
            alcance: p.alcance,
            requiere_diente: p.requiereDiente,
            permite_multiples_dientes: p.permiteMultiplesDientes,
            permite_superficies: p.permiteSuperficies,
            permite_multiples_superficies: p.permiteMultiplesSuperficies,
            requiere_diagnostico: p.requiereDiagnostico,
            permite_multiples_sesiones: p.permiteMultiplesSesiones,
          })),
        ),
      ],
    );
    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL es obligatoria para sembrar el catálogo.");
  await sembrarCatalogoGlobal(url);
}
