/**
 * The frame of every online change (invitations, users, memberships): the
 * script lock, the tabs read again inside it, one Writer that numbers and
 * logs every row, and one batch written at the end.
 */
import {
  buildUserContext,
  sameValue,
  text,
  toProjectIso,
  type Row,
  type UserContext,
  type Value,
} from '@empirica/shared';
import { Database, Sequence } from '../db/database.ts';
import { Writer } from '../db/writer.ts';
import type { Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import { LOCK_WAIT_MS } from './push.ts';

export interface LockedRun {
  env: Env;
  db: Database;
  writer: Writer;
  serverNow: string;
  nowMs: number;
}

export function underLock<T>(env: Env, userId: string, run: (r: LockedRun) => T): T {
  const lock = env.g.LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw new ApiError('BUSY');
  try {
    const db = new Database(env);
    const nowMs = env.now();
    const serverNow = toProjectIso(nowMs);
    const seq = new Sequence(env);
    const writer = new Writer(db, seq, { userId, serverNow });
    const result = run({ env, db, writer, serverNow, nowMs });
    if (db.pendingWrites) {
      seq.reserve();
      db.flush();
      seq.commit();
    }
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** The caller as of now, read inside the lock: their access may have just changed. */
export function freshContext(db: Database, userId: string): UserContext {
  const user = db.table('Usuarios').get(userId);
  if (user?.estado !== 'ACTIVO' || user.deleted) throw new ApiError('NOT_WHITELISTED');
  return buildUserContext({
    user,
    membresias: db.rows('Membresias'),
    entidades: db.rows('Entidades'),
    clientes: db.rows('Clientes'),
  });
}

/** A new row with the common columns filled in. */
export function newRow(r: LockedRun, fields: Record<string, Value>): Row {
  const by = r.writer.meta.userId;
  const stamps: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== '') stamps[k] = r.serverNow;
  return {
    id: r.env.uuid(),
    createdAt: r.serverNow,
    createdBy: by,
    updatedAt: r.serverNow,
    updatedBy: by,
    version: 1,
    deleted: null,
    fieldTimestamps: stamps,
    ...fields,
  };
}

/** The row with `changes` applied, stamped and versioned; the same row if nothing changed. */
export function changed(r: LockedRun, before: Row, changes: Record<string, Value>): Row {
  const touched = Object.keys(changes).filter((k) => !sameValue(before[k], changes[k]));
  if (!touched.length) return before;
  const stamps: Record<string, Value> = {
    ...(before.fieldTimestamps && typeof before.fieldTimestamps === 'object'
      ? (before.fieldTimestamps as Record<string, Value>)
      : {}),
  };
  for (const k of touched) stamps[k] = r.serverNow;
  return {
    ...before,
    ...changes,
    fieldTimestamps: stamps,
    version: (typeof before.version === 'number' ? before.version : 0) + 1,
    updatedAt: r.serverNow,
    updatedBy: r.writer.meta.userId,
  };
}

/** Saves a change (if any) and logs it; returns the stored row. */
export function saveChange(
  r: LockedRun,
  table: 'Usuarios' | 'Membresias' | 'Invitaciones' | 'Clientes',
  before: Row | undefined,
  after: Row,
  clienteId: string | null,
  audited: readonly string[],
): Row {
  if (before === after) return before;
  const saved = r.writer.save(table, before, after);
  const pick = (row: Row | undefined): Value => {
    if (!row) return null;
    const out: Record<string, Value> = {};
    for (const k of audited)
      if (!before || !sameValue(before[k], after[k])) out[k] = row[k] ?? null;
    return out;
  };
  r.writer.audit(
    before ? 'EDITAR' : 'CREAR',
    table,
    after.id,
    clienteId,
    pick(before),
    pick(after),
  );
  return saved;
}

/**
 * Every device of the client downloads it again: someone's role or scope
 * changed, so what they may hold changed too (PLAN.md § 5).
 */
export function bumpEpoch(r: LockedRun, clienteId: string): void {
  const cliente = r.db.table('Clientes').get(clienteId);
  if (!cliente) return;
  const epoch = typeof cliente.membershipEpoch === 'number' ? cliente.membershipEpoch : 0;
  saveChange(r, 'Clientes', cliente, { ...cliente, membershipEpoch: epoch + 1 }, clienteId, [
    'membershipEpoch',
  ]);
}

export const lowerEmail = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase();

export function userByEmail(db: Database, email: string): Row | undefined {
  const target = lowerEmail(email);
  return db.rows('Usuarios').find((u) => !u.deleted && lowerEmail(text(u, 'email')) === target);
}

export function membershipOf(db: Database, usuarioId: string, clienteId: string): Row | undefined {
  return db
    .rows('Membresias')
    .find((m) => !m.deleted && m.usuarioId === usuarioId && m.clienteId === clienteId);
}
