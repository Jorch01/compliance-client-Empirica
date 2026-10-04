/**
 * The screens read the local copy only, reactively: when the sync (or the
 * user) changes a record, every screen that shows it re-renders.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { TABLES, type Row, type TableName } from '@empirica/shared';
import { usePortal } from '../session/context.ts';
import { rowsOf, type UploadEntry } from './db.ts';

/** Live rows of a tab (deleted ones left out), optionally of one client. */
export function useRows(table: TableName, clientId: string | null = null): Row[] | undefined {
  const { db } = usePortal();
  return useLiveQuery(async () => {
    const store = rowsOf(db, table);
    const column = TABLES[table].scope.client;
    let rows: Row[];
    if (clientId && column === 'id') rows = await store.where('id').equals(clientId).toArray();
    else if (clientId && column) rows = await store.where(column).equals(clientId).toArray();
    else rows = await store.toArray();
    return rows.filter((r) => !r.deleted);
  }, [db, table, clientId]);
}

/** Live rows of a tab with the deleted ones too (to show and restore them). */
export function useAllRows(table: TableName, clientId: string | null = null): Row[] | undefined {
  const { db } = usePortal();
  return useLiveQuery(async () => {
    const store = rowsOf(db, table);
    const column = TABLES[table].scope.client;
    if (clientId && column === 'id') return store.where('id').equals(clientId).toArray();
    if (clientId && column) return store.where(column).equals(clientId).toArray();
    return store.toArray();
  }, [db, table, clientId]);
}

/**
 * One record by id, deleted or not: undefined while loading, null when the
 * device does not have it (it never existed, or the user cannot see it).
 */
export function useRow(table: TableName, id: string | undefined): Row | null | undefined {
  const { db } = usePortal();
  return useLiveQuery(
    async () => (id ? ((await rowsOf(db, table).get(id)) ?? null) : null),
    [db, table, id],
  );
}

/** The files waiting to be sent (or refused), by document id. */
export function useUploads(): ReadonlyMap<string, UploadEntry> {
  const { db } = usePortal();
  const list = useLiveQuery(() => db.uploads.toArray(), [db]);
  return new Map((list ?? []).map((u) => [u.id, u]));
}

/** Ids of the records of a tab with edits not yet confirmed by the server. */
export function usePendingIds(table: TableName): ReadonlySet<string> {
  const { db } = usePortal();
  const ids = useLiveQuery(
    async () => (await db.outbox.toArray()).filter((o) => o.table === table).map((o) => o.id),
    [db, table],
  );
  return new Set(ids ?? []);
}

export function useNotices() {
  const { db } = usePortal();
  return useLiveQuery(() => db.notices.toArray(), [db]) ?? [];
}
