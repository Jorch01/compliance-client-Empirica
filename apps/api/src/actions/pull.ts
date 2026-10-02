/**
 * sync.pull: what changed since the device's cursor, filtered on the server
 * for this user. Per changed record:
 * - visible to the user: the record (only the columns they may receive);
 * - deleted, or no longer visible: "drop it", and only if the user could see
 *   it at the cursor (so a record that was always internal is never named);
 * - otherwise nothing.
 *
 * A client whose access changed (new role or scope, or unit tree) is sent
 * whole: the device wipes it and downloads it again (`resetClients`).
 */
import {
  DEFAULT_PULL_LIMIT,
  PULLED_TABLES,
  TABLES,
  buildSnapshot,
  canRead,
  clientIdOf,
  fingerprint,
  projectRow,
  type Lookup,
  type PullData,
  type PullPayload,
  type Row,
  type TableName,
  type UserContext,
} from '@empirica/shared';
import type { Session } from '../auth.ts';
import { Sequence, type Database } from '../db/database.ts';
import { stateAt } from '../db/history.ts';
import type { Env } from '../env.ts';

interface Item {
  seq: number;
  t: TableName;
  row: Row;
  kind: 'change' | 'removal';
}

const seqOf = (row: Row): number => (typeof row.serverSeq === 'number' ? row.serverSeq : 0);

/** Whether the user could see the record once every change up to `seq` had been made. */
function visibleAt(
  ctx: UserContext,
  table: TableName,
  row: Row,
  seq: number,
  db: Database,
): boolean | 'unknown' {
  const gaps = { found: false };
  const past: Lookup = {
    get: (t, id) => {
      const r = db.table(t).get(id);
      if (!r) return undefined;
      const state = stateAt(r, seq);
      if (state === undefined) gaps.found = true;
      return state ?? undefined;
    },
  };
  const state = stateAt(row, seq);
  if (state === undefined) return 'unknown';
  if (state === null || state.deleted) return false;
  const visible = canRead(ctx, table, state, past);
  return !visible && gaps.found ? 'unknown' : visible;
}

function collect(
  ctx: UserContext,
  db: Database,
  committed: number,
  cursor: number,
  resets: ReadonlySet<string>,
): { items: Item[]; unknown: Set<string> } {
  const items: Item[] = [];
  const unknown = new Set<string>();
  if (cursor >= committed && resets.size === 0) return { items, unknown };
  const now = db.lookup();

  for (const t of PULLED_TABLES) {
    const def = TABLES[t];
    for (const row of db.rows(t)) {
      const seq = seqOf(row);
      if (seq > committed) continue;
      const clienteId = clientIdOf(def, row);
      if (clienteId !== null && !ctx.clients.has(clienteId)) continue;
      const from = clienteId !== null && resets.has(clienteId) ? 0 : cursor;
      if (seq <= from) continue;

      const visible = canRead(ctx, t, row, now);
      if (visible && !row.deleted) {
        items.push({ seq, t, row, kind: 'change' });
        continue;
      }
      if (from === 0) continue;
      if (visible) {
        items.push({ seq, t, row, kind: 'removal' });
        continue;
      }
      const before = visibleAt(ctx, t, row, from, db);
      if (before === 'unknown') {
        if (clienteId) unknown.add(clienteId);
      } else if (before) {
        items.push({ seq, t, row, kind: 'removal' });
      }
    }
  }
  return { items, unknown };
}

export function pull(env: Env, db: Database, session: Session, payload: PullPayload): PullData {
  // Read the committed sequence before any data tab: rows numbered up to it
  // are completely written.
  const committed = Sequence.committed(env);
  const { ctx } = session;
  const authorized = [...ctx.clients.keys()].sort();
  const epochs: Record<string, number> = {};
  for (const id of authorized) {
    const cliente = db.table('Clientes').get(id);
    epochs[id] = typeof cliente?.membershipEpoch === 'number' ? cliente.membershipEpoch : 0;
  }
  const cursor = payload.cursor;
  const sent = payload.epochs ?? {};
  const resets = new Set(cursor === 0 ? [] : authorized.filter((id) => sent[id] !== epochs[id]));

  let collected = collect(ctx, db, committed, cursor, resets);
  if (collected.unknown.size) {
    // History too old to tell what the device holds: send those clients whole.
    for (const id of collected.unknown) resets.add(id);
    collected = collect(ctx, db, committed, cursor, resets);
  }

  const items = collected.items.sort((a, b) => a.seq - b.seq);
  const limit = payload.limit ?? DEFAULT_PULL_LIMIT;
  let page = items;
  let more = false;
  if (items.length > limit) {
    let end = limit;
    const boundary = items[limit - 1]?.seq;
    while (end < items.length && items[end]?.seq === boundary) end++;
    page = items.slice(0, end);
    more = end < items.length;
  }
  const last = page[page.length - 1];
  const nextCursor = more && last ? last.seq : Math.max(cursor, committed);

  const snapshot = buildSnapshot(ctx, {
    usuarios: db.rows('Usuarios'),
    membresias: db.rows('Membresias'),
    entidades: db.rows('Entidades'),
    config: db.rows('Config'),
  });
  const hash = fingerprint(snapshot);

  return {
    changes: page
      .filter((i) => i.kind === 'change')
      .map((i) => ({ t: i.t, row: projectRow(ctx, i.t, i.row) })),
    removed: page
      .filter((i) => i.kind === 'removal')
      .map((i) =>
        typeof i.row.deleted === 'string' && i.row.deleted
          ? { t: i.t, id: i.row.id, deleted: i.row.deleted }
          : { t: i.t, id: i.row.id },
      ),
    cursor: nextCursor,
    more,
    authorizedClients: authorized,
    epochs,
    resetClients: [...resets].sort(),
    ...(payload.snapshotHash === hash ? {} : { snapshot: { hash, ...snapshot } }),
  };
}
