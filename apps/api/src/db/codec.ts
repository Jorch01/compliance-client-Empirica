/**
 * How values are written to and read from sheet cells.
 *
 * Every text goes in with a leading apostrophe. Sheets takes the apostrophe
 * as "this is literal text" and does not keep it in the value, so:
 * - nothing a user types can become a formula (=IMPORTXML(...), +, -, @):
 *   the formula injection that would run when the firm opens the sheet;
 * - "007", "1/2" or "TRUE" stay exactly as typed instead of turning into a
 *   number, a date or a boolean.
 * Numbers and booleans are written as such. Dates and instants are text in
 * ISO 8601, so the sheet's time zone never shifts them.
 *
 * Reading tolerates what a person may have typed by hand in the sheet: real
 * dates, numbers in text columns, "TRUE"/"FALSE" in boolean columns.
 */
import { toProjectDate, toProjectIso, type ColumnDef, type Value } from '@empirica/shared';

export function encodeCell(column: ColumnDef, value: Value | undefined): unknown {
  if (value === null || value === undefined || value === '') return '';
  switch (column.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : '';
    case 'boolean':
      return typeof value === 'boolean' ? value : '';
    case 'json':
      return `'${JSON.stringify(value)}`;
    default:
      return `'${typeof value === 'string' ? value : JSON.stringify(value)}`;
  }
}

/** Text of a cell value that is not a Date (numbers, booleans, text). */
const asText = (raw: unknown): string =>
  typeof raw === 'string'
    ? raw
    : typeof raw === 'number' || typeof raw === 'boolean'
      ? String(raw)
      : JSON.stringify(raw);

const isDate = (v: unknown): v is Date =>
  Object.prototype.toString.call(v) === '[object Date]' && !Number.isNaN((v as Date).getTime());

export function decodeCell(column: ColumnDef, raw: unknown): Value {
  if (raw === null || raw === undefined || raw === '') return null;

  if (isDate(raw)) {
    if (column.type === 'date') return toProjectDate(raw.getTime());
    return toProjectIso(raw.getTime());
  }

  switch (column.type) {
    case 'number': {
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
      const t = asText(raw).trim();
      const n = Number(t);
      return t !== '' && Number.isFinite(n) ? n : null;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      const s = asText(raw).trim().toLowerCase();
      if (s === 'true' || s === 'verdadero' || s === '1') return true;
      if (s === 'false' || s === 'falso' || s === '0') return false;
      return null;
    }
    case 'json': {
      if (typeof raw !== 'string') return null;
      try {
        return JSON.parse(raw) as Value;
      } catch {
        return null;
      }
    }
    default:
      return asText(raw);
  }
}
