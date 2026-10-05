/**
 * Every write goes through here: it numbers the row, keeps its history,
 * writes the audit log (Bitacora) and, when a change alters who may see a
 * record, re-numbers the records that hang from it so the devices re-check
 * them.
 */
import {
  TABLES,
  childTablesOf,
  parentOf,
  sameValue,
  scopeFields,
  unitOf,
  type Row,
  type TableName,
  type Value,
} from '@empirica/shared';
import type { Database, Sequence } from './database.ts';
import { recordChange } from './history.ts';

export interface WriteMeta {
  userId: string;
  serverNow: string;
  opId?: string;
  userAgent?: string;
}

export type AuditAction =
  | 'CREAR'
  | 'EDITAR'
  | 'BORRAR'
  | 'RESTAURAR'
  | 'CONFLICTO'
  | 'RESOLVER'
  | 'ARCHIVO'
  | 'RECHAZO'
  | 'TOCAR'
  | 'ENVIAR'
  | 'SISTEMA';

export class Writer {
  readonly db: Database;
  readonly seq: Sequence;
  meta: WriteMeta;

  constructor(db: Database, seq: Sequence, meta: WriteMeta) {
    this.db = db;
    this.seq = seq;
    this.meta = meta;
  }

  /** Stores a new version of a row with its sync bookkeeping. */
  save(table: TableName, before: Row | undefined, after: Row): Row {
    const def = TABLES[table];
    const serverSeq = this.seq.next();
    const row: Row = {
      ...after,
      serverSeq,
      seqAlta: before ? (before.seqAlta ?? serverSeq) : serverSeq,
      alcanceHist: recordChange(def, before, after, serverSeq),
    };
    this.db.table(table).put(row);
    if (before && scopeFields(def).some((f) => !sameValue(before[f], after[f]))) {
      this.#cascade(table, row, new Set([`${table}:${row.id}`]));
    }
    return row;
  }

  /**
   * The records hanging from `parent` are re-numbered so the next pull
   * re-checks who sees them; those that copy the parent's unit get it.
   */
  #cascade(parentTable: TableName, parent: Row, seen: Set<string>): void {
    const parentUnit = unitOf(TABLES[parentTable], parent);
    for (const childTable of childTablesOf(parentTable)) {
      const def = TABLES[childTable];
      const p = def.scope.parent;
      if (!p) continue;
      for (const child of this.db.rows(childTable)) {
        const ref = parentOf(def, child);
        if (ref?.table !== parentTable || ref.id !== parent.id) continue;
        const key = `${childTable}:${child.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const unitColumn = def.scope.unit;
        const next: Row = { ...child };
        if (
          p.unit === 'copy' &&
          unitColumn &&
          unitColumn !== 'id' &&
          !sameValue(child[unitColumn], parentUnit)
        ) {
          next[unitColumn] = parentUnit;
        }
        const serverSeq = this.seq.next();
        const saved: Row = {
          ...next,
          serverSeq,
          alcanceHist: recordChange(def, child, next, serverSeq),
        };
        this.db.table(childTable).put(saved);
        this.#cascade(childTable, saved, seen);
      }
    }
  }

  /** Appends an audit entry. */
  audit(
    accion: AuditAction,
    table: TableName | 'Sistema',
    entidadId: string,
    clienteId: string | null,
    antes: Value,
    despues: Value,
  ): void {
    this.db.table('Bitacora').put({
      id: this.db.env.uuid(),
      createdAt: this.meta.serverNow,
      createdBy: this.meta.userId,
      updatedAt: this.meta.serverNow,
      updatedBy: this.meta.userId,
      version: 1,
      deleted: null,
      serverSeq: null,
      fieldTimestamps: null,
      usuarioId: this.meta.userId,
      accion,
      entidad: table,
      entidadId,
      antes: capForAudit(antes),
      despues: capForAudit(despues),
      userAgent: this.meta.userAgent ?? null,
      clienteId,
      opId: this.meta.opId ?? null,
      seqAlta: null,
      alcanceHist: null,
    });
  }
}

/** A cell holds 50,000 characters; audit values are kept well below. */
export const MAX_AUDIT_CHARS = 20_000;

/** Shortens long texts (and, if still too long, keeps only the field names). */
export function capForAudit(value: Value): Value {
  if (value === null || JSON.stringify(value).length <= MAX_AUDIT_CHARS) return value;
  if (typeof value !== 'object' || Array.isArray(value)) return '[valor demasiado largo]';
  const shortened: Record<string, Value> = {};
  for (const [k, v] of Object.entries(value)) {
    const json = JSON.stringify(v);
    shortened[k] =
      json.length > 1_000
        ? `${(typeof v === 'string' ? v : json).slice(0, 1_000)}… (${json.length} caracteres)`
        : v;
  }
  return JSON.stringify(shortened).length <= MAX_AUDIT_CHARS
    ? shortened
    : { truncado: true, campos: Object.keys(value) };
}

/** The fields that differ, with their values before and after (for the audit log). */
export function diff(
  before: Row | undefined,
  after: Row,
  fields?: readonly string[],
): { antes: Value; despues: Value } {
  const skip = new Set([
    'updatedAt',
    'updatedBy',
    'version',
    'serverSeq',
    'fieldTimestamps',
    'seqAlta',
    'alcanceHist',
  ]);
  const keys = fields ?? Object.keys(after).filter((k) => !skip.has(k));
  const antes: Record<string, Value> = {};
  const despues: Record<string, Value> = {};
  for (const k of keys) {
    if (before && sameValue(before[k], after[k])) continue;
    if (before) antes[k] = before[k] ?? null;
    despues[k] = after[k] ?? null;
  }
  return { antes: before ? antes : null, despues };
}
