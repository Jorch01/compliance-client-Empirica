/**
 * Validation of the values a device sends for a record. The server runs it on
 * every change before anything is written; the browser runs the same code to
 * show errors before queueing a change.
 */
import * as z from 'zod/mini';
import { SYSTEM_COLUMNS, columnOf, type ColumnDef, type TableDef } from './tables.ts';
import { isEmpty, type Value } from './values.ts';

/** Google Sheets holds at most 50,000 characters per cell. */
export const LIMITS = {
  string: 1_000,
  text: 20_000,
  json: 40_000,
  email: 254,
} as const;

export interface FieldIssue {
  field: string;
  /** Machine code; the interface translates it. */
  code: 'UNKNOWN_FIELD' | 'SYSTEM_FIELD' | 'REQUIRED' | 'INVALID' | 'TOO_LONG';
}

const jsonSize = (v: unknown): number => JSON.stringify(v).length;

const schemaCache = new WeakMap<ColumnDef, z.ZodMiniType>();

function schemaFor(column: ColumnDef): z.ZodMiniType {
  const cached = schemaCache.get(column);
  if (cached) return cached;
  let schema: z.ZodMiniType;
  switch (column.type) {
    case 'id':
    case 'ref':
      schema = z.uuid();
      break;
    case 'string':
      schema = z.string().check(z.maxLength(LIMITS.string));
      break;
    case 'text':
      schema = z.string().check(z.maxLength(LIMITS.text));
      break;
    case 'email':
      schema = z.email().check(z.maxLength(LIMITS.email));
      break;
    case 'number':
      schema = z.number();
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'json':
      schema = z.unknown().check(z.refine((v) => jsonSize(v) <= LIMITS.json));
      break;
    case 'date':
      schema = z.iso.date();
      break;
    case 'datetime':
      schema = z.iso.datetime({ offset: true });
      break;
    case 'enum':
      schema = z.enum((column.values ?? []) as [string, ...string[]]);
      break;
  }
  schemaCache.set(column, schema);
  return schema;
}

function normalize(column: ColumnDef, value: Value): Value {
  if (isEmpty(value)) return null;
  if (column.type === 'email' && typeof value === 'string') return value.trim().toLowerCase();
  return value;
}

/**
 * Checks and normalizes the fields of a change: known columns only, the right
 * type, within the size limits, and mandatory columns never emptied. Whether
 * a new record has all its mandatory columns is checked after the server
 * fills in what it derives (`missingRequired`).
 */
export function validateFields(
  def: TableDef,
  fields: Readonly<Record<string, Value>>,
): { ok: true; fields: Record<string, Value> } | { ok: false; issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const out: Record<string, Value> = {};

  for (const [name, raw] of Object.entries(fields)) {
    if (SYSTEM_COLUMNS.has(name)) {
      issues.push({ field: name, code: 'SYSTEM_FIELD' });
      continue;
    }
    const column = columnOf(def, name);
    if (!column) {
      issues.push({ field: name, code: 'UNKNOWN_FIELD' });
      continue;
    }
    const value = normalize(column, raw);
    if (value === null) {
      if (column.required) issues.push({ field: name, code: 'REQUIRED' });
      else out[name] = null;
      continue;
    }
    const result = schemaFor(column).safeParse(value);
    if (!result.success) {
      const tooLong = result.error.issues.some((i) => i.code === 'too_big' || i.code === 'custom');
      issues.push({
        field: name,
        code: tooLong && column.type !== 'number' ? 'TOO_LONG' : 'INVALID',
      });
      continue;
    }
    out[name] = value;
  }

  return issues.length ? { ok: false, issues } : { ok: true, fields: out };
}

/** Mandatory columns a new record lacks. */
export function missingRequired(def: TableDef, row: Readonly<Record<string, Value>>): string[] {
  return def.columns.filter((c) => c.required && isEmpty(row[c.name])).map((c) => c.name);
}
