// Las 12 categorías de plantilla (ARQUITECTURA.md §2). Son referencia global:
// cada clínica recibe su COPIA vía clonarCatalogo() y puede renombrarla sin
// afectar a nadie más. El id es un slug estable para que la semilla sea idempotente.

export type PlantillaCategoriaSemilla = {
  id: string;
  nombre: string;
  orden: number;
};

export const PLANTILLAS_CATEGORIA: readonly PlantillaCategoriaSemilla[] = [
  { id: "diagnostico", nombre: "Diagnóstico y consulta", orden: 1 },
  { id: "preventiva", nombre: "Preventiva", orden: 2 },
  { id: "restaurativa", nombre: "Restaurativa", orden: 3 },
  { id: "endodoncia", nombre: "Endodoncia", orden: 4 },
  { id: "periodoncia", nombre: "Periodoncia", orden: 5 },
  { id: "cirugia", nombre: "Cirugía oral", orden: 6 },
  { id: "protesis-fija", nombre: "Prótesis fija", orden: 7 },
  { id: "protesis-removible", nombre: "Prótesis removible", orden: 8 },
  { id: "implantes", nombre: "Implantología", orden: 9 },
  { id: "ortodoncia", nombre: "Ortodoncia", orden: 10 },
  { id: "odontopediatria", nombre: "Odontopediatría", orden: 11 },
  { id: "estetica", nombre: "Estética dental", orden: 12 },
];
