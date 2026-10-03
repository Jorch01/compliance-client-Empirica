/**
 * The device's side of the sync (PLAN.md § 5).
 *
 * - Edits apply to the local copy at once and wait in the outbox; nothing in
 *   the interface ever waits for the network.
 * - A sync pushes the queue (in batches, in order) and then pulls what
 *   changed since the cursor, page after page.
 * - What the server sends replaces the local copy, with the edits still
 *   queued replayed on top, so the user keeps seeing their own changes.
 * - A refused change is undone (the server sends the record as it stands)
 *   and explained in a notice; conflicts on sensitive fields too.
 * - A client the user can no longer see is wiped; one whose access changed
 *   (`resetClients`) is wiped and downloaded again.
 *
 * It runs when the app opens, when the window comes back, when the network
 * returns, every minute while visible, and shortly after each edit.
 */
import {
  MAX_OPS_PER_PUSH,
  PULLED_TABLES,
  SNAPSHOT_TABLES,
  SyncClock,
  TABLES,
  clientIdOf,
  text,
  type Action,
  type Op,
  type OpResult,
  type PullData,
  type PushData,
  type Row,
  type TableName,
  type Value,
} from '@empirica/shared';
import { ApiCallError, NetworkError, type CallResult } from '../api/client.ts';
import { LOCAL_TABLES, rowsOf, type Notice, type OutboxEntry, type PortalDb } from '../data/db.ts';
import { applyLocally, enqueue, replay, type OpType } from './local.ts';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  pending: number;
  lastSyncAt: number | null;
  error: { code: string; message: string } | null;
}

export type Caller = <T>(action: Action, payload: unknown) => Promise<CallResult<T>>;

export interface EngineOptions {
  db: PortalDb;
  call: Caller;
  /** The portal user (Usuarios id): author of local edits. */
  userId: string;
  clock?: SyncClock;
  now?: () => number;
  uuid?: () => string;
  pullLimit?: number;
  /** The backend says the session is no longer valid (sign in again, no access…). */
  onAuthError?: (error: ApiCallError) => void;
}

export const META = {
  cursor: 'cursor',
  epochs: 'epochs',
  snapshotHash: 'snapshotHash',
  authorized: 'authorizedClients',
  lastContact: 'lastContact',
  lastSync: 'lastSync',
} as const;

const AUTH_CODES = new Set(['UNAUTHENTICATED', 'NOT_WHITELISTED', 'EMAIL_NOT_VERIFIED']);
const RETRY_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];

const key = (table: TableName, id: string): string => `${table}:${id}`;

/** What travels: the operation without the queue's own bookkeeping. */
function toWire(entry: OutboxEntry): Op {
  const { seq: _seq, sending: _sending, ...op } = entry;
  return op;
}

/** A short name for a record in a notice ("Licencia de funcionamiento"). */
function labelOf(row: Row | undefined): string | undefined {
  if (!row) return undefined;
  for (const field of ['titulo', 'nombre', 'razonSocial', 'mensaje', 'texto']) {
    const value = text(row, field);
    if (value) return value.slice(0, 80);
  }
  return undefined;
}

export class SyncEngine {
  readonly db: PortalDb;
  readonly userId: string;
  readonly clock: SyncClock;
  readonly #call: Caller;
  readonly #now: () => number;
  readonly #uuid: () => string;
  readonly #pullLimit: number;
  readonly #onAuthError: ((error: ApiCallError) => void) | undefined;
  #status: SyncStatus = { phase: 'idle', pending: 0, lastSyncAt: null, error: null };
  readonly #listeners = new Set<() => void>();
  #running: Promise<void> | null = null;
  #again = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #failures = 0;

  constructor(options: EngineOptions) {
    this.db = options.db;
    this.userId = options.userId;
    this.#call = options.call;
    this.clock = options.clock ?? new SyncClock(clockStorage());
    this.#now = options.now ?? Date.now;
    this.#uuid = options.uuid ?? (() => crypto.randomUUID());
    this.#pullLimit = options.pullLimit ?? 500;
    this.#onAuthError = options.onAuthError;
  }

  // ── Status, for useSyncExternalStore ─────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getStatus = (): SyncStatus => this.#status;

  #set(patch: Partial<SyncStatus>): void {
    this.#status = { ...this.#status, ...patch };
    for (const l of this.#listeners) l();
  }

  async #refreshPending(): Promise<void> {
    const pending = await this.db.outbox.count();
    if (pending !== this.#status.pending) this.#set({ pending });
  }

  // ── Local edits ──────────────────────────────────────────────────────────

  /**
   * Applies an edit locally and queues it. `fields` for 'create' and
   * 'update'; the record's client and scope columns are the caller's.
   */
  async mutate(
    table: TableName,
    type: OpType,
    id: string,
    fields: Record<string, Value> = {},
  ): Promise<Row | undefined> {
    const at = this.clock.stamp();
    const opId = this.#uuid();
    const store = rowsOf(this.db, table);
    let saved: Row | undefined;
    await this.db.transaction('rw', [store, this.db.outbox], async () => {
      const current = await store.get(id);
      const ops = await this.db.outbox.where('[table+id]').equals([table, id]).sortBy('seq');
      const pending = ops.filter((o) => !o.sending);
      const plan = enqueue(table, current, pending, { opId, type, id, fields, at });
      if (plan.remove.length) await this.db.outbox.bulkDelete(plan.remove);
      if (plan.put) await this.db.outbox.put(plan.put);
      const cancelledCreation =
        !plan.put &&
        !ops.some((o) => o.sending) &&
        pending.some(
          (o) => o.type === 'create' && o.seq !== undefined && plan.remove.includes(o.seq),
        );
      if (cancelledCreation) {
        await store.delete(id);
        saved = undefined;
      } else {
        saved = applyLocally(current, type, id, fields, at, this.userId);
        await store.put(saved);
      }
    });
    await this.#refreshPending();
    this.#schedule(1_500);
    return saved;
  }

  // ── Sync ─────────────────────────────────────────────────────────────────

  /** Pushes the queue and pulls what changed. Calls during a run wait for one more run. */
  sync(): Promise<void> {
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = this.#loop().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async #loop(): Promise<void> {
    do {
      this.#again = false;
      this.#set({ phase: 'syncing' });
      try {
        await this.#push();
        await this.#pull();
        this.#failures = 0;
        const now = this.#now();
        await this.db.meta.put({ key: META.lastSync, value: now });
        this.#set({ phase: 'idle', error: null, lastSyncAt: now });
      } catch (error) {
        this.#failed(error);
        break;
      } finally {
        await this.#refreshPending();
      }
    } while (this.#rerunRequested());
  }

  /** Someone asked for a sync while this one ran. */
  #rerunRequested(): boolean {
    return this.#again;
  }

  #failed(error: unknown): void {
    if (error instanceof NetworkError) {
      this.#set({ phase: 'offline', error: null });
    } else if (error instanceof ApiCallError) {
      this.#set({ phase: 'error', error: { code: error.code, message: error.message } });
      if (AUTH_CODES.has(error.code) || error.code === 'CLIENT_TOO_OLD') {
        this.#onAuthError?.(error);
        return;
      }
    } else {
      this.#set({
        phase: 'error',
        error: { code: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) },
      });
    }
    const delay = RETRY_MS[Math.min(this.#failures, RETRY_MS.length - 1)] ?? 300_000;
    this.#failures++;
    this.#schedule(delay);
  }

  #schedule(ms: number): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.sync();
    }, ms);
  }

  #contact(serverNow: string): Promise<unknown> {
    this.clock.adjust(serverNow);
    return this.db.meta.put({ key: META.lastContact, value: this.#now() });
  }

  async #push(): Promise<void> {
    for (;;) {
      const batch = await this.db.transaction('rw', this.db.outbox, async () => {
        const ops = await this.db.outbox
          .orderBy('seq')
          .filter((o) => !o.sending)
          .limit(MAX_OPS_PER_PUSH)
          .toArray();
        for (const o of ops)
          if (o.seq !== undefined) await this.db.outbox.update(o.seq, { sending: 1 });
        return ops;
      });
      if (!batch.length) return;
      let data: PushData;
      try {
        const res = await this.#call<PushData>('sync.push', { ops: batch.map(toWire) });
        await this.#contact(res.serverNow);
        data = res.data;
      } catch (error) {
        await this.#release(batch);
        throw error;
      }
      await this.#applyResults(batch, data.results);
    }
  }

  async #release(batch: readonly OutboxEntry[]): Promise<void> {
    const seqs = batch.flatMap((o) => (o.seq === undefined ? [] : [o.seq]));
    await this.db.outbox.where('seq').anyOf(seqs).modify({ sending: 0 });
  }

  #stores(): ReturnType<PortalDb['table']>[] {
    return LOCAL_TABLES.map((t) => this.db.table(t));
  }

  async #applyResults(batch: readonly OutboxEntry[], results: readonly OpResult[]): Promise<void> {
    const byOp = new Map(results.map((r) => [r.opId, r]));
    const at = new Date(this.#now()).toISOString();
    await this.db.transaction(
      'rw',
      [...this.#stores(), this.db.outbox, this.db.notices],
      async () => {
        for (const op of batch) {
          if (op.seq === undefined) continue;
          const result = byOp.get(op.opId);
          if (!result) {
            await this.db.outbox.update(op.seq, { sending: 0 });
            continue;
          }
          await this.db.outbox.delete(op.seq);
          const local = await rowsOf(this.db, op.table).get(op.id);
          const notice = (kind: Notice['kind'], extra: Partial<Notice>): Promise<number> =>
            this.db.notices.add({
              at,
              table: op.table,
              recordId: op.id,
              kind,
              ...(labelOf(local) ? { label: labelOf(local) } : {}),
              ...extra,
            });
          if (result.status === 'rejected') {
            await notice('rejected', {
              ...(result.code ? { code: result.code } : {}),
              ...(result.reason ? { reason: result.reason } : {}),
              ...(result.field ? { fields: [result.field] } : {}),
            });
          }
          if (result.conflicts?.length) await notice('conflict', { fields: result.conflicts });
          if (result.superseded?.length) await notice('superseded', { fields: result.superseded });

          if (result.row) await this.#acceptServerRow(op.table, result.row);
          else if (result.removed || result.status === 'rejected') {
            await this.#dropRecord(op.table, op.id);
          }
        }
      },
    );
  }

  /** The server's copy, with the edits still queued replayed on top. */
  async #acceptServerRow(table: TableName, row: Row): Promise<void> {
    const ops = await this.db.outbox.where('[table+id]').equals([table, row.id]).sortBy('seq');
    let local: Row | undefined = row;
    for (const op of ops) local = replay(local, op, this.userId);
    if (local) await rowsOf(this.db, table).put(local);
  }

  /** The record is gone for this user: so are its queued edits that never left. */
  async #dropRecord(table: TableName, id: string): Promise<void> {
    await rowsOf(this.db, table).delete(id);
    await this.db.outbox
      .where('[table+id]')
      .equals([table, id])
      .filter((o) => !o.sending)
      .delete();
  }

  async #meta<T>(name: string, fallback: T): Promise<T> {
    const entry = await this.db.meta.get(name);
    return entry === undefined ? fallback : (entry.value as T);
  }

  async #pull(): Promise<void> {
    for (;;) {
      const cursor = await this.#meta<number>(META.cursor, 0);
      const epochs = await this.#meta<Record<string, number>>(META.epochs, {});
      const snapshotHash = await this.#meta<string | null>(META.snapshotHash, null);
      const res = await this.#call<PullData>('sync.pull', {
        cursor,
        epochs,
        limit: this.#pullLimit,
        ...(snapshotHash ? { snapshotHash } : {}),
      });
      const data = res.data;
      await this.db.transaction(
        'rw',
        [...this.#stores(), this.db.outbox, this.db.meta],
        async () => {
          await this.#applyPage(data);
          await this.db.meta.bulkPut([
            { key: META.cursor, value: data.cursor },
            { key: META.epochs, value: data.epochs },
            { key: META.authorized, value: data.authorizedClients },
          ]);
        },
      );
      await this.#contact(res.serverNow);
      if (!data.more) return;
    }
  }

  async #applyPage(data: PullData): Promise<void> {
    const pendingKeys = new Set((await this.db.outbox.toArray()).map((o) => key(o.table, o.id)));
    const known = await this.#meta<string[] | null>(META.authorized, null);
    const authorized = new Set(data.authorizedClients);
    const resets = new Set(data.resetClients);
    const accessChanged =
      resets.size > 0 || known?.length !== authorized.size || known.some((c) => !authorized.has(c));

    // Clients the user may no longer see, and those to download again.
    if (accessChanged) {
      for (const t of PULLED_TABLES) {
        const def = TABLES[t];
        if (!def.scope.client) continue;
        const store = rowsOf(this.db, t);
        const drop: string[] = [];
        await store.each((row) => {
          const clienteId = clientIdOf(def, row);
          const gone = clienteId !== null && (!authorized.has(clienteId) || resets.has(clienteId));
          if (gone && !pendingKeys.has(key(t, row.id))) drop.push(row.id);
        });
        if (drop.length) await store.bulkDelete(drop);
      }
    }

    for (const change of data.changes) await this.#acceptServerRow(change.t, change.row);
    for (const removal of data.removed) {
      // A record with edits still queued waits for the server's verdict on them.
      if (!pendingKeys.has(key(removal.t, removal.id))) {
        await rowsOf(this.db, removal.t).delete(removal.id);
      }
    }
    if (data.snapshot) {
      for (const t of SNAPSHOT_TABLES) {
        const store = rowsOf(this.db, t);
        await store.clear();
        await store.bulkPut(data.snapshot[t as keyof typeof data.snapshot] as Row[]);
      }
      await this.db.meta.put({ key: META.snapshotHash, value: data.snapshot.hash });
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /** Starts syncing on its own; returns the function that stops it. */
  start(): () => void {
    // A page closed mid-request left operations marked in flight: send them again.
    void this.db.outbox
      .filter((o) => o.sending === 1)
      .modify({ sending: 0 })
      .then(() => this.#refreshPending());
    void this.#meta<number | null>(META.lastSync, null).then((lastSyncAt) => {
      if (lastSyncAt) this.#set({ lastSyncAt });
    });
    const visible = (): boolean =>
      typeof document === 'undefined' || document.visibilityState === 'visible';
    const onOnline = (): void => {
      void this.sync();
    };
    const onVisible = (): void => {
      if (visible()) void this.sync();
    };
    const onOffline = (): void => {
      this.#set({ phase: 'offline' });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(onVisible, 60_000);
    void this.sync();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
      if (this.#timer) clearTimeout(this.#timer);
      this.#timer = null;
    };
  }
}

/** The clock's offset and last stamp survive reloads (localStorage, per device). */
function clockStorage(): {
  get(key: string): string | null;
  set(key: string, value: string): void;
} {
  return {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => {
      localStorage.setItem(k, v);
    },
  };
}
