/**
 * Seeing records as someone who is not signed in: a user of the whole
 * client. Whatever goes to the client as a whole (its Google calendar, the
 * monthly report and its PDF) is made from exactly what such a user may
 * read, with the same rule as the sync (canRead), so nothing internal and
 * nothing of another client can slip in.
 */
import type { TableName } from '../domain/tables.ts';
import type { Row } from '../domain/values.ts';
import type { UserContext } from './context.ts';
import { canRead, type Lookup } from './read.ts';

/** A read-only user of the whole client (no units, no matters). */
export function wholeClientViewer(clienteId: string): UserContext {
  return {
    userId: 'cliente',
    email: '',
    lado: 'CLIENTE',
    rolBase: 'CLIENTE_LECTURA',
    isAdmin: false,
    clients: new Map([
      [clienteId, { clienteId, rol: 'CLIENTE_LECTURA' as const, alcance: null, units: null }],
    ]),
  };
}

/** The rows of each tab that a user of the whole client may read. */
export function clientViewRows<K extends TableName>(
  data: Partial<Record<K, readonly Row[]>>,
  clienteId: string,
  lookup: Lookup,
): Partial<Record<K, Row[]>> {
  const viewer = wholeClientViewer(clienteId);
  const out: Partial<Record<K, Row[]>> = {};
  for (const table of Object.keys(data) as K[]) {
    out[table] = (data[table] ?? []).filter(
      (row) => !row.deleted && canRead(viewer, table, row, lookup),
    );
  }
  return out;
}
