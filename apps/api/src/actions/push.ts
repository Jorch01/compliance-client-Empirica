/**
 * sync.push: applies the operations a device queued, in order, under the
 * script lock. For each one: idempotency by opId, validation, permission
 * (checked again: access may have changed while the device was offline),
 * the merge rules of @empirica/shared, history, cascade and audit log.
 * Everything is validated in memory and written in one batch at the end.
 */
import {
  OpSchema,
  TABLES,
  applyOp,
  authorizeWrite,
  progressOf,
  sameValue,
  buildUserContext,
  canRead,
  clampStamp,
  projectRow,
  text,
  toProjectIso,
  validateFields,
  type FieldConflict,
  type Op,
  type OpResult,
  type PushData,
  type Row,
  type TableName,
  type UserContext,
  type Value,
} from '@empirica/shared';
import type { Session } from '../auth.ts';
import { Database, Sequence } from '../db/database.ts';
import { Writer, diff } from '../db/writer.ts';
import type { Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import { conflictLink } from './conflicts.ts';
import { placeDocumentFile } from './files.ts';
import { LOCK_WAIT_MS, changed, type LockedRun } from './locked.ts';

export function push(
  env: Env,
  session: Session,
  payload: { ops: readonly unknown[] },
  meta: { userAgent?: string } = {},
): PushData {
  if (!payload.ops.length) return { results: [] };
  const lock = env.g.LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw new ApiError('BUSY');
  try {
    // Read again inside the lock: someone may have written in between.
    const db = new Database(env);
    const user = db.table('Usuarios').get(session.user.id);
    if (user?.estado !== 'ACTIVO' || user.deleted) throw new ApiError('NOT_WHITELISTED');
    const contextOf = (): UserContext =>
      buildUserContext({
        user,
        membresias: db.rows('Membresias'),
        entidades: db.rows('Entidades'),
        clientes: db.rows('Clientes'),
      });
    const ctx = contextOf();
    const nowMs = env.now();
    const serverNow = toProjectIso(nowMs);
    const seq = new Sequence(env);
    const writer = new Writer(db, seq, {
      userId: ctx.userId,
      serverNow,
      ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
    });
    const run = new PushRun(env, db, ctx, writer, nowMs, serverNow, contextOf);
    const results = payload.ops.map((raw) => {
      const parsed = OpSchema.safeParse(raw);
      if (parsed.success) return run.apply(parsed.data);
      const opId = (raw as { opId?: unknown } | null)?.opId;
      return {
        opId: typeof opId === 'string' ? opId.slice(0, 64) : '',
        status: 'rejected',
        code: 'VALIDATION',
        reason: 'INVALID_OP',
      } satisfies OpResult;
    });
    run.finish();
    seq.reserve();
    db.flush();
    seq.commit();
    return { results };
  } finally {
    lock.releaseLock();
  }
}

interface StoredResult {
  status: OpResult['status'];
  code?: OpResult['code'];
  reason?: OpResult['reason'];
  field?: string;
  superseded?: string[];
  conflicts?: string[];
}

class PushRun {
  readonly #env: Env;
  readonly #db: Database;
  #ctx: UserContext;
  readonly #contextOf: () => UserContext;
  readonly #writer: Writer;
  readonly #nowMs: number;
  readonly #serverNow: string;
  readonly #done = new Map<string, { usuarioId: string; result: StoredResult }>();
  /** Matters whose tasks changed in this run (asuntoId → clienteId): their progress, at the end. */
  readonly #matters = new Map<string, string | null>();

  constructor(
    env: Env,
    db: Database,
    ctx: UserContext,
    writer: Writer,
    nowMs: number,
    serverNow: string,
    contextOf: () => UserContext,
  ) {
    this.#env = env;
    this.#db = db;
    this.#ctx = ctx;
    this.#contextOf = contextOf;
    this.#writer = writer;
    this.#nowMs = nowMs;
    this.#serverNow = serverNow;
    for (const r of db.rows('OpsAplicadas')) {
      const opId = text(r, 'opId');
      if (opId) {
        this.#done.set(opId, {
          usuarioId: text(r, 'usuarioId') ?? '',
          result: (r.resultado ?? { status: 'applied' }) as unknown as StoredResult,
        });
      }
    }
  }

  apply(op: Op): OpResult {
    this.#writer.meta = { ...this.#writer.meta, opId: op.opId };
    const prior = this.#done.get(op.opId);
    if (prior) {
      if (prior.usuarioId !== this.#ctx.userId) {
        return { opId: op.opId, status: 'rejected', code: 'VALIDATION', reason: 'OP_ID_TAKEN' };
      }
      if (prior.result.status === 'rejected') {
        return { ...this.#current(op.table, op.id), ...prior.result, opId: op.opId };
      }
      return { ...this.#current(op.table, op.id), opId: op.opId, status: 'duplicate' };
    }
    const result = this.#evaluate(op);
    this.#record(op.opId, result);
    return result;
  }

  /** The record as it stands now, as this user may see it. */
  #current(table: TableName, id: string): Pick<OpResult, 'row' | 'removed'> {
    const row = this.#db.table(table).get(id);
    if (!row) return {};
    return canRead(this.#ctx, table, row, this.#db.lookup())
      ? { row: projectRow(this.#ctx, table, row) }
      : { removed: true };
  }

  #reject(
    op: Op,
    code: NonNullable<OpResult['code']>,
    reason: NonNullable<OpResult['reason']>,
    extra: Partial<OpResult> = {},
  ): OpResult {
    // With the record as it stands, so the device can undo what it showed.
    return {
      ...this.#current(op.table, op.id),
      opId: op.opId,
      status: 'rejected',
      code,
      reason,
      ...extra,
    };
  }

  #evaluate(op: Op): OpResult {
    const ctx = this.#ctx;
    const def = TABLES[op.table];
    const lookup = this.#db.lookup();
    const current = this.#db.table(op.table).get(op.id);
    let type = op.type;
    // A creation sent again after a failure before its result was recorded.
    if (
      type === 'create' &&
      current?.createdBy === ctx.userId &&
      canRead(ctx, op.table, current, lookup)
    ) {
      type = 'update';
    }

    let fields: Record<string, Value> = {};
    if (type === 'create' || type === 'update') {
      const checked = validateFields(def, (op.fields ?? {}) as Record<string, Value>);
      if (!checked.ok)
        return this.#reject(op, 'VALIDATION', 'INVALID_FIELDS', { issues: checked.issues });
      fields = checked.fields;
    }

    const decision = authorizeWrite(
      ctx,
      { table: op.table, type, id: op.id, current, fields },
      lookup,
    );
    if (!decision.ok) {
      if (decision.code !== 'VALIDATION') {
        this.#writer.audit('RECHAZO', op.table, op.id, null, null, {
          operacion: type,
          motivo: decision.reason,
          campo: decision.field ?? null,
        });
      }
      return this.#reject(
        op,
        decision.code,
        decision.reason,
        decision.field ? { field: decision.field } : {},
      );
    }

    const clamp = (s: string): string => clampStamp(s, this.#nowMs, this.#serverNow);
    const stamps = op.stamps
      ? Object.fromEntries(Object.entries(op.stamps).map(([k, v]) => [k, clamp(v)]))
      : undefined;
    const outcome = applyOp({
      def,
      current,
      type,
      id: op.id,
      fields: decision.fields,
      at: clamp(op.at),
      ...(stamps ? { stamps } : {}),
      ...(op.base ? { base: op.base as Record<string, Value> } : {}),
      ...(op.baseVersion !== undefined ? { baseVersion: op.baseVersion } : {}),
      userId: ctx.userId,
      serverNow: this.#serverNow,
    });
    if (outcome.status === 'rejected') return this.#reject(op, 'CONFLICT', 'EDITED_AFTER_DELETION');

    let stored = current;
    if (outcome.row) {
      stored = this.#writer.save(op.table, current, outcome.row);
      const action =
        type === 'create'
          ? 'CREAR'
          : outcome.deleted
            ? 'BORRAR'
            : outcome.restored
              ? 'RESTAURAR'
              : 'EDITAR';
      const { antes, despues } = diff(current, stored);
      this.#writer.audit(action, op.table, op.id, decision.clienteId, antes, despues);
      this.#afterSave(op.table, current, stored, decision.clienteId);
    }
    if (stored) {
      for (const c of outcome.conflicts) this.#conflict(op.table, stored, c, decision.clienteId);
    }

    return {
      opId: op.opId,
      status: outcome.conflicts.length ? 'conflict' : 'applied',
      ...this.#current(op.table, op.id),
      ...(outcome.superseded.length ? { superseded: outcome.superseded } : {}),
      ...(outcome.conflicts.length ? { conflicts: outcome.conflicts.map((c) => c.field) } : {}),
    };
  }

  /** The frame the online actions' helpers expect, over this run's writer. */
  get #run(): LockedRun {
    return {
      env: this.#env,
      db: this.#db,
      writer: this.#writer,
      serverNow: this.#serverNow,
      nowMs: this.#nowMs,
    };
  }

  /**
   * After every operation of the run: the progress of the matters whose
   * tasks changed, once each (deleting a matter with 50 tasks is one write).
   */
  finish(): void {
    const { opId: _last, ...meta } = this.#writer.meta;
    this.#writer.meta = meta;
    for (const [asuntoId, clienteId] of this.#matters) this.#refreshProgress(asuntoId, clienteId);
    this.#matters.clear();
  }

  /** A matter's progress, counted again after one of its tasks changed. */
  #refreshProgress(asuntoId: string, clienteId: string | null): void {
    const asunto = this.#db.table('Asuntos').get(asuntoId);
    if (!asunto) return;
    const avance = progressOf(this.#db.rows('Tareas').filter((t) => t.asuntoId === asuntoId));
    if (sameValue(asunto.avance, avance)) return;
    this.#writer.save('Asuntos', asunto, changed(this.#run, asunto, { avance }));
    this.#writer.audit(
      'SISTEMA',
      'Asuntos',
      asuntoId,
      clienteId,
      { avance: asunto.avance ?? null },
      { avance },
    );
  }

  /** Side effects of some changes. */
  #afterSave(
    table: TableName,
    before: Row | undefined,
    after: Row,
    clienteId: string | null,
  ): void {
    // A task created, closed, reopened, moved, deleted or restored: its matter's progress.
    if (
      table === 'Tareas' &&
      (!before ||
        before.estado !== after.estado ||
        before.asuntoId !== after.asuntoId ||
        Boolean(before.deleted) !== Boolean(after.deleted))
    ) {
      for (const id of [text(before ?? after, 'asuntoId'), text(after, 'asuntoId')]) {
        if (id) this.#matters.set(id, clienteId);
      }
    }
    // A document now seen by others (or of another area): its file changes folder.
    if (
      table === 'Documentos' &&
      before &&
      (before.visibilidad !== after.visibilidad || before.categoria !== after.categoria)
    ) {
      placeDocumentFile(this.#run, after);
    }
    // A client created (or deleted, or restored) in this batch: the next
    // operations, such as its first units, already see it as it is now.
    if (table === 'Clientes' && (!before || Boolean(before.deleted) !== Boolean(after.deleted))) {
      this.#ctx = this.#contextOf();
    }
    // Moving a unit in the tree changes who sees what: every device of that
    // client downloads it again.
    if (table === 'Entidades' && before && before.parentId !== after.parentId && clienteId) {
      const cliente = this.#db.table('Clientes').get(clienteId);
      if (cliente) {
        const epoch = typeof cliente.membershipEpoch === 'number' ? cliente.membershipEpoch : 0;
        this.#writer.save('Clientes', cliente, { ...cliente, membershipEpoch: epoch + 1 });
        this.#writer.audit(
          'SISTEMA',
          'Clientes',
          clienteId,
          clienteId,
          { membershipEpoch: epoch },
          { membershipEpoch: epoch + 1 },
        );
      }
    }
  }

  /** A sensitive field kept its value: record it and tell the responsible lawyer. */
  #conflict(table: TableName, row: Row, c: FieldConflict, clienteId: string | null): void {
    if (!clienteId) return;
    const base = {
      createdAt: this.#serverNow,
      createdBy: this.#ctx.userId,
      updatedAt: this.#serverNow,
      updatedBy: this.#ctx.userId,
      version: 1,
      deleted: null,
      fieldTimestamps: {},
    };
    const conflict: Row = {
      id: this.#env.uuid(),
      ...base,
      clienteId,
      entidad: table,
      entidadId: row.id,
      campo: c.field,
      valorVigente: JSON.stringify(c.current),
      valorPropuesto: JSON.stringify(c.proposed),
      propuestoPor: this.#ctx.userId,
      estado: 'PENDIENTE',
      resueltoPor: null,
      decision: null,
    };
    this.#writer.save('Conflictos', undefined, conflict);
    this.#writer.audit(
      'CONFLICTO',
      table,
      row.id,
      clienteId,
      { [c.field]: c.current },
      { [c.field]: c.proposed },
    );

    const cliente = this.#db.table('Clientes').get(clienteId);
    const responsible = cliente ? text(cliente, 'abogadoResponsableId') : null;
    const recipients = responsible
      ? [responsible]
      : this.#db
          .rows('Usuarios')
          .filter(
            (u) =>
              !u.deleted &&
              u.estado === 'ACTIVO' &&
              u.rolBase === 'SOCIO_ADMIN' &&
              u.lado === 'EMPIRICA',
          )
          .map((u) => u.id);
    for (const usuarioId of recipients) {
      this.#writer.save('Notificaciones', undefined, {
        id: this.#env.uuid(),
        ...base,
        usuarioId,
        clienteId,
        tipo: 'CONFLICTO',
        mensaje: `Dos cambios distintos a "${c.field}" en ${table}: se conservó el valor vigente y falta tu decisión.`,
        link: conflictLink(conflict.id),
        leida: false,
      });
    }
  }

  #record(opId: string, result: OpResult): void {
    const stored: StoredResult = { status: result.status };
    if (result.code) stored.code = result.code;
    if (result.reason) stored.reason = result.reason;
    if (result.field) stored.field = result.field;
    if (result.superseded) stored.superseded = result.superseded;
    if (result.conflicts) stored.conflicts = result.conflicts;
    this.#done.set(opId, { usuarioId: this.#ctx.userId, result: stored });
    this.#db.table('OpsAplicadas').put({
      id: this.#env.uuid(),
      createdAt: this.#serverNow,
      createdBy: this.#ctx.userId,
      updatedAt: this.#serverNow,
      updatedBy: this.#ctx.userId,
      version: 1,
      deleted: null,
      serverSeq: null,
      fieldTimestamps: null,
      opId,
      usuarioId: this.#ctx.userId,
      resultado: stored as unknown as Value,
      fecha: this.#serverNow,
      seqAlta: null,
      alcanceHist: null,
    });
  }
}
