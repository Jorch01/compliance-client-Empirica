/**
 * In-memory shape of a record, the same on the server, on the wire and in the
 * browser: one property per column, `null` for an empty cell, JSON columns
 * already parsed.
 */

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A cell value. */
export type Value = JsonValue;

export type Row = { id: string } & Record<string, Value>;

export const isEmpty = (v: unknown): v is null | undefined | '' =>
  v === null || v === undefined || v === '';

/** The value as a non-empty string, or null. */
export function text(row: Readonly<Record<string, Value>>, column: string): string | null {
  const v = row[column];
  return typeof v === 'string' && v !== '' ? v : null;
}

/** Structural equality for cell values (JSON columns compare by content). */
export function sameValue(a: Value | undefined, b: Value | undefined): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return stableStringify(a) === stableStringify(b);
}

/** JSON with object keys sorted, so equal content gives an equal string. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k];
      return sorted;
    }
    return v;
  });
}
