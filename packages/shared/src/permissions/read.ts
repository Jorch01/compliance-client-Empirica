/**
 * Who may see a record, and what of it they get.
 *
 * Rules (docs/PERMISOS.md):
 * - a client's records are seen only by its members (the SOCIO_ADMIN, all);
 * - the firm sees everything of its clients, INTERNO included;
 * - client users see only COMPARTIDO records, within their scope if their
 *   membership has one (their units, their matters, what is assigned to them
 *   or what they created);
 * - a record attached to another (a comment, a document, evidence, an event)
 *   is seen by whoever sees that other record, and nobody else; a task within
 *   a matter keeps its own scope but is hidden while the matter is internal
 *   (a shared comment on an internal matter never reaches the client);
 * - client users never receive the columns marked hiddenFromClients, and no
 *   device receives serverOnly columns or the sync bookkeeping.
 *
 * Deletion does not change who may see a record: a deleted record travels as
 * a tombstone to whoever could see it.
 */
import { isFirmRole } from '../domain/enums.ts';
import {
  BOOKKEEPING_COLUMNS,
  TABLES,
  isTableName,
  type ParentLink,
  type TableDef,
  type TableName,
} from '../domain/tables.ts';
import { text, type Row, type Value } from '../domain/values.ts';
import type { ClientAccess, UserContext } from './context.ts';
import { POLICIES } from './policies.ts';

/** Access to other records: the parents a record hangs from, and refs. */
export interface Lookup {
  get(table: TableName, id: string): Row | undefined;
}

/** The client a record belongs to, or null for tabs that are not per client. */
export function clientIdOf(
  def: TableDef,
  row: Readonly<Record<string, Value>> & { id: string },
): string | null {
  const column = def.scope.client;
  if (!column) return null;
  return column === 'id' ? row.id : text(row, column);
}

/** The record this one hangs from, if any. */
export function parentOf(
  def: TableDef,
  row: Readonly<Record<string, Value>>,
): { table: TableName; id: string } | null {
  const p = def.scope.parent;
  if (!p) return null;
  if (p.kind === 'fixed') {
    const id = text(row, p.column);
    return id ? { table: p.table, id } : null;
  }
  if (p.kind === 'column') {
    const table = text(row, p.tableColumn);
    const id = text(row, p.column);
    return table && id && isTableName(table) && p.tables.includes(table) ? { table, id } : null;
  }
  const link = row[p.column];
  if (!link || typeof link !== 'object' || Array.isArray(link)) return null;
  const { tipo, id } = link as Partial<Record<keyof ParentLink, unknown>>;
  return typeof tipo === 'string' &&
    typeof id === 'string' &&
    id !== '' &&
    isTableName(tipo) &&
    p.tables.includes(tipo)
    ? { table: tipo, id }
    : null;
}

/** The business unit a record belongs to (for units themselves, their own id). */
export function unitOf(
  def: TableDef,
  row: Readonly<Record<string, Value>> & { id: string },
): string | null {
  const column = def.scope.unit;
  if (!column) return null;
  return column === 'id' ? row.id : text(row, column);
}

/** Within a unit-scoped membership: its units, its matters, or assigned to the user. */
export function inScope(
  access: ClientAccess,
  def: TableDef,
  row: Readonly<Record<string, Value>> & { id: string },
  userId: string,
): boolean {
  if (!access.alcance || !access.units) return true;
  const s = def.scope;
  let partitioned = false;
  if (s.unit) {
    partitioned = true;
    const unit = unitOf(def, row);
    if (unit && access.units.has(unit)) return true;
  }
  if (s.asunto) {
    partitioned = true;
    const asunto = s.asunto === 'id' ? row.id : text(row, s.asunto);
    if (asunto && access.alcance.asuntos.includes(asunto)) return true;
  }
  for (const owner of s.owners ?? []) {
    partitioned = true;
    if (row[owner] === userId) return true;
  }
  return !partitioned;
}

const MAX_PARENT_DEPTH = 6;

/**
 * Whether the user may see the record. Snapshot tabs (users, memberships,
 * settings) are decided in snapshot.ts, with the whole tab at hand.
 */
export function canRead(ctx: UserContext, table: TableName, row: Row, lookup: Lookup): boolean {
  return canReadAt(ctx, table, row, lookup, 0);
}

function canReadAt(
  ctx: UserContext,
  table: TableName,
  row: Row,
  lookup: Lookup,
  depth: number,
): boolean {
  if (depth > MAX_PARENT_DEPTH) return false;
  const def = TABLES[table];
  if (def.sync === 'snapshot' || def.sync === 'none') return false;

  if (def.audience === 'own') {
    return ctx.isAdmin || (def.scope.user !== undefined && row[def.scope.user] === ctx.userId);
  }

  if (def.audience === 'everyone') {
    if (def.scope.user && row[def.scope.user] !== ctx.userId) return false;
    const clienteId = clientIdOf(def, row);
    return clienteId === null || ctx.clients.has(clienteId);
  }

  if (def.audience === 'firm') {
    if (ctx.lado !== 'EMPIRICA' || !POLICIES[table][ctx.rolBase].read) return false;
    if (!def.scope.client) return true;
    const clienteId = clientIdOf(def, row);
    return clienteId !== null && ctx.clients.has(clienteId);
  }

  const clienteId = clientIdOf(def, row);
  if (!clienteId) return false;
  const access = ctx.clients.get(clienteId);
  if (!access) return false;
  if (isFirmRole(access.rol)) return true;
  if (!POLICIES[table][access.rol].read) return false;
  if (def.scope.visibility && row.visibilidad !== 'COMPARTIDO') return false;

  const parentRef = parentOf(def, row);
  if (parentRef && def.scope.parent) {
    const parent = lookup.get(parentRef.table, parentRef.id);
    if (!parent || clientIdOf(TABLES[parentRef.table], parent) !== clienteId) return false;
    if (def.scope.parent.mode === 'attached') {
      return canReadAt(ctx, parentRef.table, parent, lookup, depth + 1);
    }
    return (
      inScope(access, def, row, ctx.userId) &&
      sharedChain(parentRef.table, parent, lookup, depth + 1)
    );
  }
  return inScope(access, def, row, ctx.userId);
}

/** A record and everything above it are shared (not INTERNO). */
function sharedChain(table: TableName, row: Row, lookup: Lookup, depth: number): boolean {
  if (depth > MAX_PARENT_DEPTH) return false;
  const def = TABLES[table];
  if (def.scope.visibility && row.visibilidad !== 'COMPARTIDO') return false;
  const ref = parentOf(def, row);
  if (!ref) return true;
  const parent = lookup.get(ref.table, ref.id);
  if (!parent || clientIdOf(TABLES[ref.table], parent) !== clientIdOf(def, row)) return false;
  return sharedChain(ref.table, parent, lookup, depth + 1);
}

const BOOKKEEPING = new Set(BOOKKEEPING_COLUMNS.map((c) => c.name));

/** Whether the viewer sees this client's records as a client user. */
export function viewsAsClient(ctx: UserContext, clienteId: string | null): boolean {
  if (ctx.lado !== 'EMPIRICA') return true;
  if (!clienteId) return false;
  const access = ctx.clients.get(clienteId);
  return !access || !isFirmRole(access.rol);
}

/** The copy of a record a user receives. */
export function projectRow(ctx: UserContext, table: TableName, row: Row): Row {
  const def = TABLES[table];
  const drop = new Set<string>([...BOOKKEEPING, ...def.serverOnly]);
  if (viewsAsClient(ctx, clientIdOf(def, row))) {
    for (const c of def.hiddenFromClients) drop.add(c);
  }
  const out: Row = { id: row.id };
  for (const [key, value] of Object.entries(row)) {
    if (!drop.has(key)) out[key] = value;
  }
  return out;
}
