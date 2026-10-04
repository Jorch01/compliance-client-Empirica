/**
 * The screens read the local copy only, reactively: when the sync (or the
 * user) changes a record, every screen that shows it re-renders.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { TABLES, type Row, type TableName } from '@empirica/shared';
import { usePortal } from '../session/context.ts';
import { rowsOf } from './db.ts';

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
