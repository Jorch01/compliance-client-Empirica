/**
 * `alcanceHist`: the previous values of the fields that decide who sees a
 * record (visibility, unit, matter, assignee) and of its deletion, each with
 * the sequence number of the change.
 *
 * With it, `sync.pull` can tell whether a user could see a record at the
 * device's cursor, and so tell that device to drop a record that left its
 * view, without ever revealing to anyone a record that was always internal.
 */
import { scopeFields, sameValue, type Row, type TableDef, type Value } from '@empirica/shared';

export interface HistEntry {
  /** Sequence of the change. */
  s: number;
  /** Values before the change. */
  p: Record<string, Value>;
}

export interface Hist {
  e: HistEntry[];
  /** Changes before this sequence were dropped to keep the cell small. */
  t?: number;
}

export const MAX_HIST_ENTRIES = 20;

export const trackedFields = (def: TableDef): string[] => [...scopeFields(def), 'deleted'];

const isEntry = (x: unknown): x is HistEntry => {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return typeof e.s === 'number' && !!e.p && typeof e.p === 'object' && !Array.isArray(e.p);
};

export function parseHist(value: Value | undefined): Hist {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { e: [] };
  const raw = value as { e?: unknown; t?: unknown };
  const entries = Array.isArray(raw.e) ? raw.e.filter(isEntry) : [];
  return typeof raw.t === 'number' ? { e: entries, t: raw.t } : { e: entries };
}

/** The history after a change numbered `seq`, or the same one if nothing tracked changed. */
export function recordChange(
  def: TableDef,
  before: Row | undefined,
  after: Row,
  seq: number,
): Value {
  const hist = parseHist(before?.alcanceHist);
  if (!before) return null;
  const previous: Record<string, Value> = {};
  for (const field of trackedFields(def)) {
    if (!sameValue(before[field], after[field])) previous[field] = before[field] ?? null;
  }
  if (!Object.keys(previous).length) return before.alcanceHist ?? null;
  const entries = [...hist.e, { s: seq, p: previous }];
  if (entries.length <= MAX_HIST_ENTRIES) {
    return { ...hist, e: entries } as unknown as Value;
  }
  const dropped = entries.slice(0, entries.length - MAX_HIST_ENTRIES);
  const kept = entries.slice(entries.length - MAX_HIST_ENTRIES);
  const truncatedBefore = Math.max(hist.t ?? 0, ...dropped.map((d) => d.s));
  return { e: kept, t: truncatedBefore } as unknown as Value;
}

/**
 * The record as it stood once every change numbered up to `seq` had been
 * applied: null if it did not exist yet, undefined if the history needed to
 * know was dropped.
 */
export function stateAt(row: Row, seq: number): Row | null | undefined {
  const created = typeof row.seqAlta === 'number' ? row.seqAlta : 0;
  if (created > seq) return null;
  const hist = parseHist(row.alcanceHist);
  const later = hist.e.filter((x) => x.s > seq).sort((a, b) => b.s - a.s);
  if (!later.length) return row;
  if (hist.t !== undefined && seq < hist.t) return undefined;
  let state: Row = { ...row };
  for (const entry of later) state = { ...state, ...entry.p };
  return state;
}
