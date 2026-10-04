/**
 * Local edits (PLAN.md § 5): a change is applied to the local copy first,
 * stamped field by field with the sync clock, and queued as an operation
 * for the server. Consecutive edits of a record that has not been sent yet
 * travel together in one operation, each field with its own stamp.
 */
import {
  TABLES,
  isEmpty,
  sameValue,
  stampsOf,
  type Op,
  type Row,
  type TableName,
  type Value,
} from '@empirica/shared';
import type { OutboxEntry } from '../data/db.ts';

export type OpType = Op['type'];

/** The local record after an edit (what the interface shows until the server confirms). */
export function applyLocally(
  current: Row | undefined,
  type: OpType,
  id: string,
  fields: Readonly<Record<string, Value>>,
  at: string,
  userId: string,
): Row {
  if (type === 'create' || !current) {
    const stamps: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) if (!isEmpty(v)) stamps[k] = at;
    return {
      ...fields,
      id,
      createdAt: at,
      createdBy: userId,
      updatedAt: at,
      updatedBy: userId,
      version: 0,
      deleted: null,
      fieldTimestamps: stamps,
    };
  }
  if (type === 'delete') return { ...current, deleted: at };
  if (type === 'restore') return { ...current, deleted: null };
  const stamps: Record<string, Value> = { ...stampsOf(current) };
  const next: Row = { ...current };
  for (const [k, v] of Object.entries(fields)) {
    if (sameValue(current[k], v)) continue;
    next[k] = v;
    stamps[k] = at;
  }
  next.fieldTimestamps = stamps;
  next.updatedAt = at;
  next.updatedBy = userId;
  return next;
}

/** Re-applies a queued operation on top of a record (after the server sent a newer copy). */
export function replay(row: Row | undefined, op: OutboxEntry, userId: string): Row | undefined {
  const fields = (op.fields ?? {}) as Record<string, Value>;
  if (!row) {
    return op.type === 'create'
      ? applyLocally(undefined, 'create', op.id, fields, op.at, userId)
      : undefined;
  }
  if (op.type === 'delete') return { ...row, deleted: op.at };
  if (op.type === 'restore') return { ...row, deleted: null };
  const next: Row = { ...row };
  const stamps: Record<string, Value> = { ...stampsOf(row) };
  for (const [k, v] of Object.entries(fields)) {
    next[k] = v;
    stamps[k] = op.stamps?.[k] ?? op.at;
  }
  next.fieldTimestamps = stamps;
  return next;
}

export interface Enqueue {
  /** Operations to delete from the queue. */
  remove: number[];
  /** The operation to write (new, or a pending one merged with this edit). */
  put: OutboxEntry | null;
}

/**
 * How a new edit joins the queue. `pending` holds the record's operations
 * not yet in flight, oldest first; `current` is the local record before the
 * edit (its sensitive values are what the server must still have, `base`).
 */
export function enqueue(
  table: TableName,
  current: Row | undefined,
  pending: readonly OutboxEntry[],
  edit: { opId: string; type: OpType; id: string; fields: Record<string, Value>; at: string },
): Enqueue {
  const last = pending[pending.length - 1];
  const sensitive = TABLES[table].sensitive;
  const baseOf = (prior: OutboxEntry | undefined): Record<string, Value> | undefined => {
    const base: Record<string, Value> = { ...((prior?.base ?? {}) as Record<string, Value>) };
    for (const field of Object.keys(edit.fields)) {
      if (sensitive.includes(field) && !(field in base)) base[field] = current?.[field] ?? null;
    }
    return Object.keys(base).length ? base : undefined;
  };
  const fresh = (): OutboxEntry => {
    const base = edit.type === 'update' ? baseOf(undefined) : undefined;
    const version = typeof current?.version === 'number' ? current.version : 0;
    return {
      opId: edit.opId,
      table,
      id: edit.id,
      type: edit.type,
      at: edit.at,
      sending: 0,
      ...(edit.type === 'create' || edit.type === 'update' ? { fields: edit.fields } : {}),
      ...(base ? { base } : {}),
      ...(edit.type === 'update' && version > 0 ? { baseVersion: version } : {}),
    };
  };
  if (!last?.seq) return { remove: [], put: fresh() };

  const mergeFields = (): OutboxEntry => {
    const stamps: Record<string, string> = { ...(last.stamps ?? {}) };
    for (const k of Object.keys(last.fields ?? {})) stamps[k] ??= last.at;
    for (const k of Object.keys(edit.fields)) stamps[k] = edit.at;
    const base = last.type === 'update' ? baseOf(last) : undefined;
    const { base: _drop, ...rest } = last;
    return {
      ...rest,
      fields: { ...(last.fields ?? {}), ...edit.fields },
      stamps,
      at: edit.at,
      ...(base ? { base } : {}),
    };
  };

  switch (edit.type) {
    case 'update':
      if (last.type === 'create' || last.type === 'update') {
        return { remove: [], put: mergeFields() };
      }
      return { remove: [], put: fresh() };
    case 'delete':
      // Never reached the server: nothing to tell it.
      if (last.type === 'create')
        return { remove: pending.flatMap((o) => (o.seq ? [o.seq] : [])), put: null };
      if (last.type === 'update')
        return { remove: [last.seq], put: { ...fresh(), opId: edit.opId } };
      return { remove: [], put: fresh() };
    case 'restore':
      if (last.type === 'delete') return { remove: [last.seq], put: null };
      return { remove: [], put: fresh() };
    case 'create':
      return { remove: [], put: fresh() };
  }
}
