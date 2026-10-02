/**
 * Which edit wins. Ported from TSJ Filing (sync.js `obtenerTimestampCampo`,
 * `fusionarRegistroPorCampo`, `_eliminadoGana`; database.js `ultimaEdicionDe`,
 * `_borradoMandaSobre`), adapted to this model: every record carries the
 * stamp of each field in `fieldTimestamps` and a dated tombstone in `deleted`.
 *
 * Rules:
 * - each field keeps its most recent edit, so two people editing different
 *   fields of the same record never overwrite each other;
 * - clearing a field on purpose is an edit like any other;
 * - a field never edited counts from the record's creation, not from its last
 *   update (otherwise it would inherit a false recency and overwrite someone
 *   else's explicit edit of that field);
 * - a deletion wins only if it is later than the record's last edit, so an
 *   old deletion never swallows newer work done offline elsewhere.
 *
 * Timestamps are compared as instants, never as strings.
 */
import type { Row, Value } from '../domain/values.ts';
import { isEmpty } from '../domain/values.ts';
import { parseInstant } from '../time.ts';

export type Stamps = Record<string, string>;

/** Columns that are not data and never merge field by field. */
const NOT_MERGED = new Set([
  'id',
  'fieldTimestamps',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  'version',
  'serverSeq',
  'deleted',
  'seqAlta',
  'alcanceHist',
]);

export function stampsOf(row: Readonly<Record<string, Value>>): Stamps {
  const raw = row.fieldTimestamps;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Stamps = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
  return out;
}

const instant = (s: string | null | undefined): number => parseInstant(s) ?? 0;

/** When a field was last edited: its own stamp, or the record's creation. */
export function fieldStamp(row: Readonly<Record<string, Value>>, field: string): string {
  const own = stampsOf(row)[field];
  if (own) return own;
  return typeof row.createdAt === 'string' ? row.createdAt : '';
}

/** The record's last edit, looking at every stamp it carries. */
export function lastEditOf(row: Readonly<Record<string, Value>>): string {
  let last = typeof row.createdAt === 'string' ? row.createdAt : '';
  for (const stamp of Object.values(stampsOf(row))) {
    if (instant(stamp) > instant(last)) last = stamp;
  }
  return last;
}

/**
 * Whether a deletion stamped `deletedAt` wins over the record: only if it is
 * not earlier than the record's last edit. Every device compares the same
 * dates, so all reach the same decision.
 */
export function deletionWins(
  deletedAt: string | null | undefined,
  row: Readonly<Record<string, Value>>,
): boolean {
  if (!deletedAt) return true;
  return !(instant(lastEditOf(row)) > instant(deletedAt));
}

/**
 * Merges two copies of the same record field by field. The result does not
 * depend on the order of the arguments, so every device converges.
 */
export function mergeByField(a: Row, b: Row): Row {
  const merged: Row = { ...a };
  const stampsA = stampsOf(a);
  const stampsB = stampsOf(b);
  const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
  const stamps: Stamps = {};

  // Stamps that are not data fields (a restore leaves one under `deleted`):
  // keep the later of the two.
  for (const key of new Set([...Object.keys(stampsA), ...Object.keys(stampsB)])) {
    if (fields.has(key) && !NOT_MERGED.has(key)) continue;
    const kept = laterStamp(stampsA[key], stampsB[key]);
    if (kept) stamps[key] = kept;
  }

  for (const field of fields) {
    if (NOT_MERGED.has(field)) continue;
    const va = a[field] ?? null;
    const vb = b[field] ?? null;
    const sa = fieldStamp(a, field);
    const sb = fieldStamp(b, field);
    const ta = instant(sa);
    const tb = instant(sb);
    let stamp = sa || sb;
    if (tb > ta) {
      merged[field] = isEmpty(vb) ? null : vb;
      stamp = sb;
    } else if (ta === tb) {
      // Exact tie: a filled value beats an empty one; two filled values are
      // ordered by their JSON so both sides pick the same.
      if (isEmpty(va) && !isEmpty(vb)) merged[field] = vb;
      else if (!isEmpty(va) && !isEmpty(vb) && JSON.stringify(vb) > JSON.stringify(va)) {
        merged[field] = vb;
      }
    }
    if (stamp) stamps[field] = stamp;
  }

  const createdA = typeof a.createdAt === 'string' ? a.createdAt : null;
  const createdB = typeof b.createdAt === 'string' ? b.createdAt : null;
  if (createdA && createdB) {
    merged.createdAt = instant(createdA) <= instant(createdB) ? createdA : createdB;
  }

  const deletedA = typeof a.deleted === 'string' && a.deleted ? a.deleted : null;
  const deletedB = typeof b.deleted === 'string' && b.deleted ? b.deleted : null;
  const deletedAt = laterStamp(deletedA, deletedB);

  merged.fieldTimestamps = stamps;
  merged.deleted = deletedAt && deletionWins(deletedAt, merged) ? deletedAt : null;
  return merged;
}

function laterStamp(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return instant(b) > instant(a) ? b : a;
}
