/**
 * Compliance (PLAN.md § 4: Obligaciones and CumplimientosHistorial): the
 * periods of each obligation, what was done about each one, and the matrix
 * by category and month the compliance screen draws.
 *
 * A period is one date of the obligation's rule (`recurrencia`), or its only
 * date when it has no rule. That nominal date is the key of the compliance
 * records (`CumplimientosHistorial.periodo`); the period is due on the next
 * working day when the obligation moves (`recorreSiInhabil`).
 *
 * `proximoVencimiento` is the first period not yet validated: the server
 * moves it forward when the firm validates that one, and back when a
 * validation is withdrawn. So a period before it counts only if there is a
 * record for it (the history), and from it on every period counts:
 * validated, in review, or by its date overdue, due soon or pending. A
 * rejected record leaves the period open again.
 */
import {
  daysInMonth,
  isoDate,
  nextOccurrence,
  nextWorkingDay,
  occurrencesBetween,
  parseRecurrence,
  type Recurrence,
} from './recurrence.ts';
import { text, type Row } from './values.ts';

export type PeriodState = 'cumplido' | 'revision' | 'vencido' | 'porVencer' | 'pendiente';

export interface Period {
  /** The rule's date: the key of its compliance records. */
  periodo: string;
  /** When it is due: the next working day if the obligation moves. */
  vence: string;
  estado: PeriodState;
  /** The last record sent for it was turned down. */
  rechazado: boolean;
  /** Its compliance records, oldest first. */
  registros: Row[];
}

/** "Por vencer": due within this many days. */
export const DUE_SOON_DAYS = 7;

const DAY_MS = 86_400_000;
const daysFrom = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** The compliance records of an obligation, by period. */
export function recordsByPeriod(
  obligacionId: string,
  cumplimientos: readonly Row[],
): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const c of cumplimientos) {
    if (c.deleted || c.obligacionId !== obligacionId) continue;
    const periodo = text(c, 'periodo');
    if (periodo) map.set(periodo, [...(map.get(periodo) ?? []), c]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (text(a, 'createdAt') ?? '').localeCompare(text(b, 'createdAt') ?? ''));
  }
  return map;
}

const isValidated = (registros: readonly Row[] | undefined): boolean =>
  (registros ?? []).some((r) => r.estado === 'VALIDADO');

function stateOf(
  registros: readonly Row[],
  vence: string,
  today: string,
): { estado: PeriodState; rechazado: boolean } {
  const last = registros.at(-1);
  const rechazado = last?.estado === 'RECHAZADO';
  if (isValidated(registros)) return { estado: 'cumplido', rechazado: false };
  if (registros.some((r) => r.estado === 'EN_REVISION')) return { estado: 'revision', rechazado };
  if (vence < today) return { estado: 'vencido', rechazado };
  if (daysFrom(today, vence) <= DUE_SOON_DAYS) return { estado: 'porVencer', rechazado };
  return { estado: 'pendiente', rechazado };
}

const isLive = (obligacion: Row): boolean =>
  !obligacion.deleted && obligacion.estado !== 'INACTIVA';

/**
 * The periods of an obligation whose dates fall from `from` to `to`. An
 * inactive or deleted obligation, or one without a date, has none.
 */
export function periodsOf(
  obligacion: Row,
  cumplimientos: readonly Row[],
  from: string,
  to: string,
  today: string,
  inhabiles: ReadonlySet<string>,
): Period[] {
  if (!isLive(obligacion)) return [];
  const anchor = text(obligacion, 'proximoVencimiento');
  if (!anchor) return [];
  const rule = parseRecurrence(text(obligacion, 'recurrencia'));
  const byPeriod = recordsByPeriod(obligacion.id, cumplimientos);
  const inRange = (date: string): boolean => date >= from && date <= to;
  // The date the firm wrote always counts, even off the rule's step.
  const dates = new Set(rule ? occurrencesBetween(rule, anchor, from, to) : []);
  if (inRange(anchor)) dates.add(anchor);
  // The history stays even if the rule changed since.
  for (const periodo of byPeriod.keys()) if (inRange(periodo)) dates.add(periodo);
  const moves = obligacion.recorreSiInhabil === true;
  const out: Period[] = [];
  for (const periodo of [...dates].sort()) {
    const registros = byPeriod.get(periodo) ?? [];
    if (periodo < anchor && !registros.some((r) => r.estado !== 'RECHAZADO')) continue;
    const vence = moves ? nextWorkingDay(periodo, inhabiles) : periodo;
    out.push({ periodo, vence, registros, ...stateOf(registros, vence, today) });
  }
  return out;
}

/** From `start` on, the first period without a validated record (null: none left). */
function firstOpenFrom(
  rule: Recurrence | null,
  anchor: string,
  start: string,
  byPeriod: ReadonlyMap<string, Row[]>,
): string | null {
  let date: string | null = start;
  // A monthly rule validated fifty years ahead is not a case: the walk stops.
  for (let i = 0; i < 600 && date; i++) {
    if (!isValidated(byPeriod.get(date))) return date;
    if (!rule) return null;
    date = nextOccurrence(rule, anchor, date);
  }
  return null;
}

/**
 * What the obligation needs now: its first period not yet validated (from
 * `proximoVencimiento` on), or null when there is none (a one-time
 * obligation already validated, an inactive one, or one without a date).
 */
export function currentPeriod(
  obligacion: Row,
  cumplimientos: readonly Row[],
  today: string,
  inhabiles: ReadonlySet<string>,
): Period | null {
  const anchor = text(obligacion, 'proximoVencimiento');
  if (!anchor || !isLive(obligacion)) return null;
  const rule = parseRecurrence(text(obligacion, 'recurrencia'));
  const date = firstOpenFrom(rule, anchor, anchor, recordsByPeriod(obligacion.id, cumplimientos));
  if (!date) return null;
  return periodsOf(obligacion, cumplimientos, date, date, today, inhabiles)[0] ?? null;
}

/**
 * Where `proximoVencimiento` goes after the obligation's records changed:
 * back to a period whose validation was withdrawn (`reopened`: the periods
 * that lost a validated record), else forward past the periods validated.
 * Null when it stays: no date, or no rule (a one-time obligation keeps its
 * only date).
 */
export function firstOpenPeriod(
  obligacion: Row,
  cumplimientos: readonly Row[],
  reopened: readonly string[] = [],
): string | null {
  const rule = parseRecurrence(text(obligacion, 'recurrencia'));
  const anchor = text(obligacion, 'proximoVencimiento');
  if (!rule || !anchor) return null;
  const byPeriod = recordsByPeriod(obligacion.id, cumplimientos);
  const back = reopened
    .filter((p) => p < anchor && !isValidated(byPeriod.get(p)))
    .sort()
    .at(0);
  return firstOpenFrom(rule, anchor, back ?? anchor, byPeriod) ?? anchor;
}

/** An obligation as a whole: its current period's state, or why it has none. */
export type ObligationState = PeriodState | 'cumplida' | 'inactiva' | 'sinFecha';

export function obligationState(
  obligacion: Row,
  cumplimientos: readonly Row[],
  today: string,
  inhabiles: ReadonlySet<string>,
): { estado: ObligationState; period: Period | null } {
  if (obligacion.estado === 'INACTIVA') return { estado: 'inactiva', period: null };
  if (!text(obligacion, 'proximoVencimiento')) return { estado: 'sinFecha', period: null };
  const period = currentPeriod(obligacion, cumplimientos, today, inhabiles);
  return period ? { estado: period.estado, period } : { estado: 'cumplida', period: null };
}

export interface MatrixItem {
  obligacion: Row;
  period: Period;
}

export interface MatrixCell {
  /** "2026-03" */
  month: string;
  total: number;
  cumplido: number;
  revision: number;
  vencido: number;
  porVencer: number;
  pendiente: number;
  /** The periods counted, by due date. */
  items: MatrixItem[];
}

export interface MatrixRow {
  categoria: string;
  cells: MatrixCell[];
}

/** The months of a year: "2026-01" … "2026-12". */
export function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => isoDate(year, i + 1, 1).slice(0, 7));
}

const emptyCell = (month: string): MatrixCell => ({
  month,
  total: 0,
  cumplido: 0,
  revision: 0,
  vencido: 0,
  porVencer: 0,
  pendiente: 0,
  items: [],
});

function count(cell: MatrixCell, item: MatrixItem): void {
  cell.total++;
  cell[item.period.estado]++;
  cell.items.push(item);
}

/**
 * The compliance matrix: one row per category that has obligations, one
 * cell per month, counting the periods whose date falls in that month by
 * their state. Categories keep the order given.
 */
export function complianceMatrix(
  obligaciones: readonly Row[],
  cumplimientos: readonly Row[],
  categories: readonly string[],
  months: readonly string[],
  today: string,
  inhabiles: ReadonlySet<string>,
): MatrixRow[] {
  const first = months[0];
  const last = months.at(-1);
  if (!first || !last) return [];
  const [ly, lm] = last.split('-').map(Number) as [number, number];
  const from = `${first}-01`;
  const to = isoDate(ly, lm, daysInMonth(ly, lm));
  const rows: MatrixRow[] = [];
  for (const categoria of categories) {
    const mine = obligaciones.filter((o) => o.categoria === categoria && isLive(o));
    if (!mine.length) continue;
    const cells = new Map(months.map((month) => [month, emptyCell(month)]));
    for (const obligacion of mine) {
      for (const period of periodsOf(obligacion, cumplimientos, from, to, today, inhabiles)) {
        const cell = cells.get(period.periodo.slice(0, 7));
        if (cell) count(cell, { obligacion, period });
      }
    }
    for (const cell of cells.values()) {
      cell.items.sort((a, b) => a.period.vence.localeCompare(b.period.vence));
    }
    rows.push({ categoria, cells: [...cells.values()] });
  }
  return rows;
}

/** Every category together, month by month (the matrix's last row). */
export function matrixTotals(rows: readonly MatrixRow[], months: readonly string[]): MatrixCell[] {
  const totals = new Map(months.map((month) => [month, emptyCell(month)]));
  for (const row of rows) {
    for (const cell of row.cells) {
      const total = totals.get(cell.month);
      if (total) for (const item of cell.items) count(total, item);
    }
  }
  return [...totals.values()];
}

/**
 * How green a cell is (1 to 4): the share of its due periods that were
 * validated. Null when nothing was due yet (only future periods, or none).
 */
export function cellLevel(cell: MatrixCell): 1 | 2 | 3 | 4 | null {
  const due = cell.cumplido + cell.revision + cell.vencido;
  if (!due) return null;
  const share = cell.cumplido / due;
  if (share >= 1) return 4;
  if (share >= 0.9) return 3;
  if (share >= 0.5) return 2;
  return 1;
}

/** The days the firm marked as non-working, as the periods use them. */
export function nonWorkingDays(diasInhabiles: readonly Row[]): Set<string> {
  const out = new Set<string>();
  for (const d of diasInhabiles) {
    const fecha = text(d, 'fecha');
    if (fecha && !d.deleted) out.add(fecha.slice(0, 10));
  }
  return out;
}
