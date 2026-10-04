/**
 * Filings before an authority (`Tramites`) and the firm's templates for them
 * (`PlantillasTramite`): the stages a filing goes through, where it stands
 * and since when. The stages and their estimated days are the firm's: the
 * portal orders and counts them, and invents none (CLAUDE.md).
 *
 *   PlantillasTramite.etapas   [{ "nombre": "Presentación", "dias": 10 }, …]
 *   Tramites.historialEtapas   [{ "etapa": "Presentación", "fecha": "2026-09-15", "nota": "…" }, …]
 */
import { ESTADOS_TRAMITE } from './enums.ts';
import { text, type Row, type Value } from './values.ts';

export type EstadoTramite = (typeof ESTADOS_TRAMITE)[number];

/** A stage of a template, with the days it usually takes (if the firm says). */
export interface Stage {
  nombre: string;
  dias: number | null;
}

/** When a filing entered a stage. */
export interface StageEntry {
  etapa: string;
  fecha: string;
  nota: string | null;
}

/** Filings still moving: the pipeline's columns, in order. */
export const OPEN_FILING_STATES: readonly EstadoTramite[] = [
  'EN_PREPARACION',
  'EN_TRAMITE',
  'REQUERIMIENTO',
];

export const isOpenFiling = (row: Row): boolean =>
  (OPEN_FILING_STATES as readonly Value[]).includes(row.estado ?? null);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A template's stages; whatever is not a stage with a name is left out. */
export function parseStages(value: Value | undefined): Stage[] {
  if (!Array.isArray(value)) return [];
  const out: Stage[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.nombre !== 'string' || !item.nombre.trim()) continue;
    const dias =
      typeof item.dias === 'number' && Number.isInteger(item.dias) && item.dias >= 0
        ? item.dias
        : null;
    out.push({ nombre: item.nombre.trim(), dias });
  }
  return out;
}

/** The stages as stored. */
export function stagesValue(stages: readonly Stage[]): Value {
  return stages.map((s) => (s.dias === null ? { nombre: s.nombre } : { ...s }));
}

/** A filing's history, oldest first; malformed entries are left out. */
export function parseHistory(value: Value | undefined): StageEntry[] {
  if (!Array.isArray(value)) return [];
  const out: StageEntry[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.etapa !== 'string' || !item.etapa.trim()) continue;
    if (typeof item.fecha !== 'string' || !DATE.test(item.fecha)) continue;
    out.push({
      etapa: item.etapa.trim(),
      fecha: item.fecha,
      nota: typeof item.nota === 'string' && item.nota.trim() ? item.nota.trim() : null,
    });
  }
  return out;
}

/**
 * The fields that move a filing to a stage on a date: the stage becomes the
 * current one and the history gains an entry (the earlier ones stay).
 */
export function moveToStage(
  tramite: Row,
  etapa: string,
  fecha: string,
  nota?: string | null,
): { etapaActual: string; historialEtapas: Value } {
  const entry: Record<string, Value> = { etapa: etapa.trim(), fecha };
  if (nota?.trim()) entry.nota = nota.trim();
  const history = Array.isArray(tramite.historialEtapas) ? tramite.historialEtapas : [];
  return { etapaActual: etapa.trim(), historialEtapas: [...history, entry] };
}

/** Since when the filing is in its current stage, if the history says. */
export function stageSince(tramite: Row): string | null {
  const actual = text(tramite, 'etapaActual');
  if (!actual) return null;
  const last = parseHistory(tramite.historialEtapas)
    .filter((e) => e.etapa === actual)
    .at(-1);
  return last?.fecha ?? null;
}

export interface StageProgress {
  /** Position of the current stage in the template (0-based), or -1. */
  index: number;
  total: number;
  /** The template's next stage, if there is one. */
  next: Stage | null;
}

/** Where the filing stands in its template's stages. */
export function stageProgress(tramite: Row, stages: readonly Stage[]): StageProgress {
  const actual = text(tramite, 'etapaActual');
  const index = actual ? stages.findIndex((s) => s.nombre === actual) : -1;
  // Off the template there is no next stage; not started, its first one.
  const next = index >= 0 ? stages[index + 1] : actual ? undefined : stages[0];
  return { index, total: stages.length, next: next ?? null };
}

/** The date of the next thing to watch: the deadline or the next action, the sooner. */
export function filingDate(tramite: Row): string | null {
  const dates = [text(tramite, 'fechaLimite'), text(tramite, 'proximaActuacion')].filter(
    (d): d is string => Boolean(d),
  );
  return dates.sort()[0] ?? null;
}
