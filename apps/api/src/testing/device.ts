/**
 * A minimal device for the tests: keeps a local copy and applies what
 * sync.pull sends (wipes, changes, removals), page after page, the way the
 * browser will in phase 2.
 */
import {
  TABLES,
  clientIdOf,
  type Op,
  type PullData,
  type PushData,
  type Row,
  type TableName,
} from '@empirica/shared';
import type { World } from './harness.ts';

export class Device {
  readonly #world: World;
  readonly userId: string;
  cursor = 0;
  epochs: Record<string, number> = {};
  snapshotHash: string | undefined;
  readonly store = new Map<string, { t: TableName; row: Row }>();
  /** Everything received in the last sync(). */
  last = { changes: [] as string[], removed: [] as string[], resets: [] as string[], pages: 0 };
  snapshot: PullData['snapshot'];

  constructor(world: World, userId: string) {
    this.#world = world;
    this.userId = userId;
  }

  sync(limit?: number): this {
    this.last = { changes: [], removed: [], resets: [], pages: 0 };
    let more = true;
    while (more) {
      const data = this.#world.ok<PullData>(
        'sync.pull',
        {
          cursor: this.cursor,
          epochs: this.epochs,
          ...(this.snapshotHash ? { snapshotHash: this.snapshotHash } : {}),
          ...(limit ? { limit } : {}),
        },
        { as: this.userId },
      );
      this.last.pages++;
      const authorized = new Set(data.authorizedClients);
      for (const [key, { t, row }] of this.store) {
        const clienteId = clientIdOf(TABLES[t], row);
        if (clienteId && (!authorized.has(clienteId) || data.resetClients.includes(clienteId))) {
          this.store.delete(key);
        }
      }
      this.last.resets.push(...data.resetClients);
      for (const c of data.changes) {
        this.store.set(`${c.t}:${c.row.id}`, c);
        this.last.changes.push(`${c.t}:${c.row.id}`);
      }
      for (const r of data.removed) {
        this.store.delete(`${r.t}:${r.id}`);
        this.last.removed.push(`${r.t}:${r.id}`);
      }
      this.cursor = data.cursor;
      this.epochs = data.epochs;
      if (data.snapshot) {
        this.snapshot = data.snapshot;
        this.snapshotHash = data.snapshot.hash;
      }
      more = data.more;
    }
    return this;
  }

  /** The last snapshot received, forgetting it (to see whether another one comes). */
  takeSnapshot(): PullData['snapshot'] {
    const s = this.snapshot;
    this.snapshot = undefined;
    return s;
  }

  push(ops: Op[]): PushData['results'] {
    return this.#world.ok<PushData>('sync.push', { ops }, { as: this.userId }).results;
  }

  has(t: TableName, id: string): boolean {
    return this.store.has(`${t}:${id}`);
  }

  get(t: TableName, id: string): Row | undefined {
    return this.store.get(`${t}:${id}`)?.row;
  }

  ids(t: TableName): string[] {
    return [...this.store.values()]
      .filter((e) => e.t === t)
      .map((e) => e.row.id)
      .sort();
  }

  rows(): Row[] {
    return [...this.store.values()].map((e) => e.row);
  }
}

let counter = 0;

/** An operation as a device would queue it. */
export function op(
  table: TableName,
  type: Op['type'],
  id: string,
  fields?: Record<string, unknown>,
  extra: Partial<Op> = {},
): Op {
  counter++;
  return {
    opId: `00000000-0000-4000-9000-${counter.toString(16).padStart(12, '0')}`,
    table,
    type,
    id,
    at: '2026-10-02T11:59:00.000-05:00',
    ...(fields ? { fields } : {}),
    ...extra,
  };
}
