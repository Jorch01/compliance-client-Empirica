/**
 * What the interface offers: the same permission matrix the server applies
 * (packages/shared/src/permissions), read for the user's role in a client.
 * The server still checks every change; a refused one is undone with a notice.
 */
import { allows, type Operation, type Rol, type TableName } from '@empirica/shared';
import type { Me } from '../session/context.ts';

/** The user's role in a client: the firm's base role, or the client membership's. */
export function roleIn(me: Me, clientId: string | null): Rol | null {
  if (me.isFirm) {
    if (me.isAdmin) return 'SOCIO_ADMIN';
    return clientId === null || me.clients.some((c) => c.id === clientId) ? me.rolBase : null;
  }
  if (!clientId) return null;
  return me.clients.find((c) => c.id === clientId)?.rol ?? null;
}

/** Whether the user may attempt an operation on a tab within a client. */
export function can(me: Me, table: TableName, op: Operation, clientId: string | null): boolean {
  const rol = roleIn(me, clientId);
  return rol !== null && allows(table, rol, op);
}
