type TratamientoDb = {
  id: string;
  categoriaId: string;
  codigo: string;
  nombre: string;
  plantilla: { nombre: string } | null;
  preferencias: { alias: string | null; favorito: boolean }[];
  activo: boolean;
  alcance: "DIENTE" | "BOCA";
  requiereDiente: boolean;
  permiteMultiplesDientes: boolean;
  permiteSuperficies: boolean;
  permiteMultiplesSuperficies: boolean;
  requiereDiagnostico: boolean;
  permiteMultiplesSesiones: boolean;
};

type CategoriaDb = {
  id: string;
  nombre: string;
  orden: number;
};

export function toTratamientoDto(tratamiento: TratamientoDb) {
  const preferencia = tratamiento.preferencias[0];
  return {
    id: tratamiento.id,
    categoriaId: tratamiento.categoriaId,
    codigo: tratamiento.codigo,
    nombre: tratamiento.nombre,
    nombreReferencia: tratamiento.plantilla?.nombre ?? null,
    aliasPersonal: preferencia?.alias ?? null,
    favorito: preferencia?.favorito ?? false,
    activo: tratamiento.activo,
    alcance: tratamiento.alcance,
    requiereDiente: tratamiento.requiereDiente,
    permiteMultiplesDientes: tratamiento.permiteMultiplesDientes,
    permiteSuperficies: tratamiento.permiteSuperficies,
    permiteMultiplesSuperficies: tratamiento.permiteMultiplesSuperficies,
    requiereDiagnostico: tratamiento.requiereDiagnostico,
    permiteMultiplesSesiones: tratamiento.permiteMultiplesSesiones,
  };
}

export type TratamientoDto = ReturnType<typeof toTratamientoDto>;

export function toCategoriaDto(categoria: CategoriaDb) {
  return { id: categoria.id, nombre: categoria.nombre, orden: categoria.orden };
}

export type CategoriaDto = ReturnType<typeof toCategoriaDto>;

export function toCategoriaConTratamientosDto(
  categoria: CategoriaDb & { tratamientos: TratamientoDb[] },
) {
  return {
    ...toCategoriaDto(categoria),
    tratamientos: categoria.tratamientos.map(toTratamientoDto),
  };
}

export type CategoriaConTratamientosDto = ReturnType<typeof toCategoriaConTratamientosDto>;
