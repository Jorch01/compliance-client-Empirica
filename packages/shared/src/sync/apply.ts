/**
 * How the server applies one queued operation to the stored record (PLAN.md
 * § 5, "Conflictos"). Pure: it receives the stored record and returns the new
 * one; persisting it, numbering it and logging it is the caller's job.
 *
 * - Ordinary fields: the most recent edit of each field wins, with the
 *   device's stamp clamped so that a clock running fast cannot win forever.
 * - If the device started from the current version (`baseVersion`), its
 *   change applies as is: it saw what it was replacing.
 * - Legally sensitive fields apply only if the device started from the
 *   current value; otherwise the current value stays and a conflict is
 *   reported for a lawyer to decide.
 * - A deletion wins only if it is not earlier than the last edit; an edit
 *   later than a deletion brings the record back.
 */
import type { TableDef } from '../domain/tables.ts';
import { isEmpty, sameValue, type Row, type Value } from '../domain/values.ts';
import { parseInstant } from '../time.ts';
import { deletionWins, fieldStamp, stampsOf, type Stamps } from './merge.ts';

/** Stamps further ahead of the server than this are pulled back to its time. */
export const MAX_CLOCK_LEAD_MS = 5 * 60_000;

export function clampStamp(
  stamp: string | null | undefined,
  serverNowMs: number,
  serverNowIso: string,
): string {
  if (!stamp) return serverNowIso;
  const t = parseInstant(stamp);
  return t === null || t > serverNowMs + MAX_CLOCK_LEAD_MS ? serverNowIso : stamp;
}

export interface ApplyInput {
  def: TableDef;
  /** The stored record (it may be deleted); undefined for a creation. */
  current: Row | undefined;
  type: 'create' | 'update' | 'delete' | 'restore';
  id: string;
  /** Approved values (authorizeWrite). */
  fields: Readonly<Record<string, Value>>;
  /** The time of the edit, already clamped. */
  at: string;
  /** Per-field times when they differ from `at`, already clamped. */
  stamps?: Readonly<Stamps>;
  /** Values the device started from, for the sensitive fields it changes. */
  base?: Readonly<Record<string, Value>>;
  baseVersion?: number;
  userId: string;
  serverNow: string;
}

export interface FieldConflict {
  field: string;
  current: Value;
  proposed: Value;
}

export interface ApplyResult {
  /** 'noop': nothing to store (conflicts may still have been found); 'rejected': see reason. */
  status: 'applied' | 'noop' | 'rejected';
  reason?: 'EDITED_AFTER_DELETION';
  /** The record to store when status is 'applied'. */
  row: Row | null;
  applied: string[];
  /** Fields where a more recent edit by someone else was kept. */
  superseded: string[];
  conflicts: FieldConflict[];
  deleted?: boolean;
  restored?: boolean;
}

const instant = (s: string | null | undefined): number => parseInstant(s) ?? 0;
const later = (a: string, b: string): string => (instant(b) > instant(a) ? b : a);

export function applyOp(input: ApplyInput): ApplyResult {
  const empty = { applied: [], superseded: [], conflicts: [] };
  const { current } = input;

  if (input.type === 'create' || !current) {
    const stamps: Stamps = {};
    const row: Row = {
      id: input.id,
      createdAt: input.at,
      createdBy: input.userId,
      updatedAt: input.serverNow,
      updatedBy: input.userId,
      version: 1,
      deleted: null,
    };
    for (const [field, value] of Object.entries(input.fields)) {
      row[field] = value;
      if (!isEmpty(value)) stamps[field] = input.stamps?.[field] ?? input.at;
    }
    row.fieldTimestamps = stamps;
    return { ...empty, status: 'applied', row, applied: Object.keys(input.fields) };
  }

  const touch = (row: Row): Row => ({
    ...row,
    version: (typeof current.version === 'number' ? current.version : 0) + 1,
    updatedAt: input.serverNow,
    updatedBy: input.userId,
  });

  if (input.type === 'delete') {
    if (current.deleted) return { ...empty, status: 'noop', row: null };
    if (!deletionWins(input.at, current)) {
      return { ...empty, status: 'rejected', reason: 'EDITED_AFTER_DELETION', row: null };
    }
    return {
      ...empty,
      status: 'applied',
      row: touch({ ...current, deleted: input.at }),
      deleted: true,
    };
  }

  if (input.type === 'restore') {
    if (!current.deleted) return { ...empty, status: 'noop', row: null };
    const stamps = { ...stampsOf(current), deleted: later(current.deleted as string, input.at) };
    return {
      ...empty,
      status: 'applied',
      row: touch({ ...current, deleted: null, fieldTimestamps: stamps }),
      restored: true,
    };
  }

  const sameBase = input.baseVersion !== undefined && input.baseVersion === current.version;
  const next: Row = { ...current };
  const stamps: Stamps = { ...stampsOf(current) };
  const applied: string[] = [];
  const superseded: string[] = [];
  const conflicts: FieldConflict[] = [];
  let latestApplied = 0;

  for (const [field, value] of Object.entries(input.fields)) {
    if (sameValue(current[field], value)) continue;
    const stamp = input.stamps?.[field] ?? input.at;
    const currentStamp = fieldStamp(current, field);
    let wins: boolean;

    if (input.def.sensitive.includes(field)) {
      const startedFromCurrent =
        sameBase ||
        (input.base !== undefined &&
          field in input.base &&
          sameValue(input.base[field], current[field]));
      if (!startedFromCurrent) {
        conflicts.push({ field, current: current[field] ?? null, proposed: value });
        continue;
      }
      wins = true;
    } else if (sameBase) {
      wins = true;
    } else {
      const t = instant(stamp);
      const c = instant(currentStamp);
      wins = t > c || (t === c && isEmpty(current[field]) && !isEmpty(value));
    }

    if (!wins) {
      superseded.push(field);
      continue;
    }
    next[field] = value;
    stamps[field] = currentStamp ? later(currentStamp, stamp) : stamp;
    applied.push(field);
    latestApplied = Math.max(latestApplied, instant(stamp));
  }

  if (!applied.length) return { status: 'noop', row: null, applied, superseded, conflicts };

  next.fieldTimestamps = stamps;
  let restored = false;
  if (current.deleted && latestApplied > instant(current.deleted as string)) {
    next.deleted = null;
    restored = true;
  }
  return {
    status: 'applied',
    row: touch(next),
    applied,
    superseded,
    conflicts,
    ...(restored ? { restored } : {}),
  };
}
