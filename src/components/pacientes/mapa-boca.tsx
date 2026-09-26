import Link from "next/link";

import { arcada } from "@/components/odontograma/arcada";
import type { CondicionDental } from "@/lib/odontograma";
import {
  colorCondicion,
  etiquetaCondicion,
  letraCondicion,
  textoSobreCondicion,
} from "@/lib/odontograma";
import type { PiezaDelResumen } from "@/server/db/resumen-boca";

/**
 * El vistazo de la boca, para la ficha del paciente.
 *
 * **Por qué existe.** Al abrir un expediente, lo primero que un odontólogo
 * quiere saber es en qué anda esa boca. Hasta ahora había que entrar al
 * odontograma, a Procedimientos y a Planes, y armarlo de memoria.
 *
 * **Qué NO es.** No es el odontograma. El odontograma se edita, se registra por
 * cara y guarda historia; esto solo mira. Por eso es compacto, no tiene formulario
 * y cada pieza lleva enlace al odontograma completo, que sigue siendo el lugar
 * donde se trabaja.
 *
 * **Tres hechos, no un semáforo.** "Tratada", "planificada" y "con hallazgo" son
 * cosas distintas que pueden darse a la vez en la misma pieza: una muela con
 * caries, ya obturada y con una corona pendiente es las tres. Un semáforo de un
 * solo color obligaría a elegir cuál gana, y esa elección sería una lectura
 * clínica que al software no le toca hacer (`CLAUDE.md` §15).
 *
 * **El color nunca va solo.** Cada condición lleva su letra (§ `lib/odontograma`),
 * lo tratado lleva un punto y lo planificado un borde punteado. Cerca del 8% de
 * los hombres no distingue rojo de verde, y esto es historia clínica.
 */

const SIN_REGISTRO = "var(--muted)";

function Pieza({
  fdi,
  datos,
  pacienteId,
  indice,
  total,
  arriba,
}: {
  fdi: number;
  datos: PiezaDelResumen | undefined;
  pacienteId: string;
  indice: number;
  total: number;
  arriba: boolean;
}) {
  // Misma curva que el odontograma grande: la boca se reconoce por la forma.
  const t = total > 1 ? (indice / (total - 1)) * 2 - 1 : 0;
  const desplazamiento = (arriba ? 1 : -1) * 14 * t * t;

  const condicion = datos?.condiciones[0] as CondicionDental | undefined;
  const fondo = condicion ? colorCondicion(condicion) : SIN_REGISTRO;
  const texto = condicion ? textoSobreCondicion(condicion) : "var(--muted-foreground)";

  const partes = [`Pieza ${fdi}`];
  if (datos?.condiciones.length) {
    partes.push(datos.condiciones.map((c) => etiquetaCondicion(c as CondicionDental)).join(", "));
  }
  if (datos?.tratada) partes.push(`tratada: ${datos.tratamientosHechos.join(", ")}`);
  if (datos?.planificada && !datos.tratada) partes.push("con tratamiento aceptado pendiente");
  if (datos?.conPendiente) partes.push("marcada con tratamiento pendiente en el odontograma");
  if (partes.length === 1) partes.push("sin registro");

  return (
    <Link
      href={`/pacientes/${pacienteId}/odontograma`}
      title={partes.join(" · ")}
      aria-label={partes.join(". ")}
      className="flex flex-col items-center gap-0.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={{ transform: `translateY(${desplazamiento}px)` }}
    >
      <span className="text-[9px] leading-none text-muted-foreground tabular-nums">{fdi}</span>
      <span
        className="flex h-6 w-5 items-center justify-center rounded-sm border text-[10px] font-semibold"
        style={{
          backgroundColor: fondo,
          color: texto,
          borderColor: datos?.planificada && !datos.tratada ? "var(--foreground)" : "transparent",
          borderStyle: datos?.planificada && !datos.tratada ? "dashed" : "solid",
        }}
      >
        {condicion ? letraCondicion(condicion) : ""}
      </span>
      {/* Punto = hay procedimiento realizado en esta pieza. */}
      <span
        aria-hidden
        className="h-1 w-1 rounded-full"
        style={{ backgroundColor: datos?.tratada ? "var(--primary)" : "transparent" }}
      />
    </Link>
  );
}

function Fila({
  dientes,
  porPieza,
  pacienteId,
  arriba,
}: {
  dientes: readonly { fdi: number }[];
  porPieza: Map<number, PiezaDelResumen>;
  pacienteId: string;
  arriba: boolean;
}) {
  return (
    <div className="flex items-end justify-center gap-[3px]">
      {dientes.map((diente, i) => (
        <Pieza
          key={diente.fdi}
          fdi={diente.fdi}
          datos={porPieza.get(diente.fdi)}
          pacienteId={pacienteId}
          indice={i}
          total={dientes.length}
          arriba={arriba}
        />
      ))}
    </div>
  );
}

export function MapaBoca({
  pacienteId,
  resumen,
}: {
  pacienteId: string;
  resumen: {
    piezas: readonly PiezaDelResumen[];
    totalTratadas: number;
    totalConHallazgo: number;
    totalPlanificadas: number;
    totalConPendiente: number;
  };
}) {
  const porPieza = new Map(resumen.piezas.map((p) => [p.fdi, p]));
  // Solo dentición permanente: la temporal se ve en el odontograma completo.
  const superior = arcada(1, 2).filter((d) => d.denticion === "PERMANENTE");
  const inferior = arcada(4, 3).filter((d) => d.denticion === "PERMANENTE");

  const vacio = resumen.piezas.length === 0;

  return (
    <section id="zonas" className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Zonas trabajadas</h2>
        <Link
          href={`/pacientes/${pacienteId}/odontograma`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Abrir odontograma
        </Link>
      </div>

      {vacio ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Todavía no hay nada registrado en la boca de este paciente. Cuando se anote un hallazgo en
          el odontograma o se realice un procedimiento, aparece acá.
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { n: resumen.totalTratadas, t: "piezas tratadas" },
              { n: resumen.totalConHallazgo, t: "con hallazgo anotado" },
              { n: resumen.totalPlanificadas, t: "aceptadas sin realizar" },
              { n: resumen.totalConPendiente, t: "marcadas pendientes" },
            ].map(({ n, t }) => (
              <div key={t} className="rounded-lg bg-muted/50 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{t}</dt>
                <dd className="text-xl font-semibold tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 space-y-3 overflow-x-auto pb-1">
            <Fila dientes={superior} porPieza={porPieza} pacienteId={pacienteId} arriba />
            <Fila dientes={inferior} porPieza={porPieza} pacienteId={pacienteId} arriba={false} />
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> con procedimiento realizado
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm border border-dashed border-foreground" aria-hidden /> aceptada, sin realizar
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: SIN_REGISTRO }} aria-hidden /> sin registro
            </li>
            <li>La letra es la condición anotada; el detalle está en el odontograma.</li>
          </ul>
        </>
      )}
    </section>
  );
}
