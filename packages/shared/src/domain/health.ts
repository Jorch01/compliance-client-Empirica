/**
 * The health index of a client (PLAN.md § 8): 100 minus points for each
 * thing that needs attention, by weights the partner can change
 * (`Config.pesosSalud`). It reads the dates and states of the records, never
 * hours worked. The same function serves the control center (everything
 * the firm sees) and the monthly report (only what the client sees).
 */
import { currentPeriod } from './compliance.ts';
import { isOpenFiling, stageSince } from './filings.ts';
import { daysBetween } from './lights.ts';
import { text, type Row } from './values.ts';

export const HEALTH_FACTORS = [
  /** An obligation whose current period is overdue. */
  'obligacionVencida',
  /** A fatal deadline within FATAL_SOON_DAYS. */
  'fatalProximo',
  /** A task past its deadline (not in review). */
  'tareaVencida',
  /** A filing with no new stage in STALLED_DAYS. */
  'tramiteDetenido',
  /** A task waiting on the client longer than Config.diasEsperaCliente. */
  'esperaCliente',
] as const;
export type HealthFactor = (typeof HEALTH_FACTORS)[number];
export type HealthWeights = Record<HealthFactor, number>;

export const DEFAULT_HEALTH_WEIGHTS: Readonly<HealthWeights> = {
  obligacionVencida: 10,
  fatalProximo: 8,
  tareaVencida: 5,
  tramiteDetenido: 4,
  esperaCliente: 2,
};

/** A filing with no new stage in this many days counts as stalled. */
export const STALLED_DAYS = 30;
/** A fatal deadline this many days away (or fewer) counts. */
export const FATAL_SOON_DAYS = 7;

export type HealthBand = 'good' | 'watch' | 'risk';

export interface HealthPart {
  factor: HealthFactor;
  count: number;
  points: number;
}

export interface HealthIndex {
  /** 0 to 100. */
  score: number;
  band: HealthBand;
  /** Every factor, in order, with what it took away. */
  parts: HealthPart[];
}

/** `Config.pesosSalud`, JSON; anything missing or invalid takes its default. */
export function parseHealthWeights(value: string | null | undefined): HealthWeights {
  const out: HealthWeights = { ...DEFAULT_HEALTH_WEIGHTS };
  let parsed: unknown;
  try {
    parsed = value ? JSON.parse(value) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
  for (const factor of HEALTH_FACTORS) {
    const w = (parsed as Record<string, unknown>)[factor];
    if (typeof w === 'number' && Number.isFinite(w) && w >= 0 && w <= 100) out[factor] = w;
  }
  return out;
}

export const healthBand = (score: number): HealthBand =>
  score >= 80 ? 'good' : score >= 60 ? 'watch' : 'risk';

export interface HealthData {
  Tareas?: readonly Row[];
  Obligaciones?: readonly Row[];
  CumplimientosHistorial?: readonly Row[];
  Tramites?: readonly Row[];
}

export interface HealthOptions {
  today: string;
  inhabiles: ReadonlySet<string>;
  weights: HealthWeights;
  /** Config.diasEsperaCliente. */
  waitingDays: number;
}

const live = (rows: readonly Row[] | undefined): Row[] => (rows ?? []).filter((r) => !r.deleted);

/** How many of each factor the records show. */
export function healthCounts(data: HealthData, o: HealthOptions): Record<HealthFactor, number> {
  const tareas = live(data.Tareas);
  const open = tareas.filter((t) => t.estado !== 'HECHO');
  const cumplimientos = live(data.CumplimientosHistorial);
  const days = (date: string | null): number | null => (date ? daysBetween(o.today, date) : null);
  return {
    obligacionVencida: live(data.Obligaciones).filter(
      (ob) => currentPeriod(ob, cumplimientos, o.today, o.inhabiles)?.estado === 'vencido',
    ).length,
    fatalProximo: open.filter((t) => {
      const d = days(text(t, 'fechaLimite'));
      return t.esFatal === true && d !== null && d >= 0 && d <= FATAL_SOON_DAYS;
    }).length,
    tareaVencida: open.filter((t) => {
      const d = days(text(t, 'fechaLimite'));
      return t.estado !== 'EN_REVISION' && d !== null && d < 0;
    }).length,
    tramiteDetenido: live(data.Tramites).filter((f) => {
      if (!isOpenFiling(f)) return false;
      const since = stageSince(f) ?? text(f, 'createdAt');
      return since !== null && daysBetween(since, o.today) > STALLED_DAYS;
    }).length,
    esperaCliente: open.filter((t) => {
      if (t.estado !== 'EN_ESPERA_CLIENTE') return false;
      const since = text(t, 'enEsperaDesde') ?? text(t, 'updatedAt');
      return since !== null && daysBetween(since, o.today) > o.waitingDays;
    }).length,
  };
}

export function healthIndex(data: HealthData, o: HealthOptions): HealthIndex {
  const counts = healthCounts(data, o);
  const parts = HEALTH_FACTORS.map((factor) => ({
    factor,
    count: counts[factor],
    points: counts[factor] * o.weights[factor],
  }));
  const score = Math.max(0, Math.round(100 - parts.reduce((sum, p) => sum + p.points, 0)));
  return { score, band: healthBand(score), parts };
}
