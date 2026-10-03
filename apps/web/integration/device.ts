/**
 * A browser, as far as the sync is concerned: its own local database
 * (IndexedDB, simulated) and the real sync engine, talking to a test world
 * of apps/api (the real backend with simulated Google services). Its network
 * can be cut.
 */
import { SyncClock, type Row, type TableName } from '@empirica/shared';
import { randomUUID } from 'node:crypto';
import type { World } from '../../api/src/testing/harness.ts';
import { ApiCallError, NetworkError } from '../src/api/client.ts';
import { openDb, rowsOf, type PortalDb } from '../src/data/db.ts';
import { SyncEngine } from '../src/sync/engine.ts';

export class TestBrowser {
  readonly db: PortalDb;
  readonly engine: SyncEngine;
  online = true;
  calls: string[] = [];

  constructor(world: World, userId: string) {
    this.db = openDb(`test-${randomUUID()}`);
    this.engine = new SyncEngine({
      db: this.db,
      userId,
      clock: new SyncClock(undefined, () => world.clock.now()),
      now: () => world.clock.now(),
      uuid: randomUUID,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the engine names the payload it expects
      call: <T>(action: Parameters<World['call']>[0], payload: unknown) => {
        this.calls.push(action);
        if (!this.online) return Promise.reject(new NetworkError());
        const res = world.call<T>(action, payload, { as: userId });
        if (!res.ok) {
          return Promise.reject(
            new ApiCallError(
              res.error.code,
              res.error.message,
              res.error.details ?? {},
              res.serverNow,
            ),
          );
        }
        return Promise.resolve({ data: res.data, serverNow: res.serverNow });
      },
    });
  }

  sync(): Promise<void> {
    return this.engine.sync();
  }

  get(table: TableName, id: string): Promise<Row | undefined> {
    return rowsOf(this.db, table).get(id);
  }

  async ids(table: TableName): Promise<string[]> {
    return (await rowsOf(this.db, table).toArray())
      .filter((r) => !r.deleted)
      .map((r) => r.id)
      .sort();
  }

  outbox() {
    return this.db.outbox.orderBy('seq').toArray();
  }

  notices() {
    return this.db.notices.toArray();
  }
}
