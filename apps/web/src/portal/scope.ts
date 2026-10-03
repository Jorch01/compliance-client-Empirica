import { createContext, use, useMemo } from 'react';
import type { ClientSummary, Row, TableName } from '@empirica/shared';
import { useRows } from '../data/hooks.ts';
import { inScope, type Scope } from '../domain/scope.ts';

export interface ScopeContextValue {
  scope: Scope;
  setClient: (clientId: string | null) => void;
  setUnit: (unitId: string | null) => void;
  /** Clients the user may choose, by name (local copy: new ones appear at once). */
  clients: Row[];
  /** The user's access to the selected client (role and scope), from the server. */
  access: ClientSummary | null;
  /** Units of the selected client the user may see. */
  entidades: Row[];
  /** The selected unit with its branches, or null for the whole client. */
  units: ReadonlySet<string> | null;
}

export const ScopeContext = createContext<ScopeContextValue | null>(null);

export function useScope(): ScopeContextValue {
  const value = use(ScopeContext);
  if (!value) throw new Error('useScope needs a <ScopeProvider>');
  return value;
}

/** Live rows of a tab within the chosen client and unit; undefined while loading. */
export function useScopedRows(table: TableName): Row[] | undefined {
  const { scope, units } = useScope();
  const rows = useRows(table, scope.clientId);
  return useMemo(
    () => rows?.filter((row) => inScope(table, row, scope, units)),
    [rows, table, scope, units],
  );
}

/** A client's display name: the trade name if it has one. */
export function clientName(client: Row | ClientSummary | undefined): string {
  if (!client) return '';
  const short = client.nombreComercial;
  const legal = client.razonSocial;
  return typeof short === 'string' && short ? short : typeof legal === 'string' ? legal : '';
}
