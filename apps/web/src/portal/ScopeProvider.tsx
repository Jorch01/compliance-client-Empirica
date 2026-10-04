import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRows } from '../data/hooks.ts';
import { unitsUnder, type Scope } from '../domain/scope.ts';
import { usePortal } from '../session/context.ts';
import { ScopeContext, clientName, type ScopeContextValue } from './scope.ts';

const key = (userId: string): string => `empirica.scope.${userId}`;

function load(userId: string): Scope {
  try {
    const saved = JSON.parse(localStorage.getItem(key(userId)) ?? 'null') as Partial<Scope> | null;
    return {
      clientId: typeof saved?.clientId === 'string' ? saved.clientId : null,
      unitId: typeof saved?.unitId === 'string' ? saved.unitId : null,
    };
  } catch {
    return { clientId: null, unitId: null };
  }
}

/**
 * The client and unit the user is looking at, remembered per user on this
 * device. Firm users may look at every client at once; a client user always
 * has one client selected (usually their only one).
 */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const { me } = usePortal();
  const [chosen, setChosen] = useState<Scope>(() => load(me.id));
  const allClients = useRows('Clientes');
  const allUnits = useRows('Entidades');

  const clients = useMemo(() => {
    const allowed = new Set(me.clients.map((c) => c.id));
    return (allClients ?? [])
      .filter((c) => me.isFirm || allowed.has(c.id))
      .sort((a, b) => clientName(a).localeCompare(clientName(b), 'es'));
  }, [allClients, me]);

  // What was remembered may no longer apply (access withdrawn, unit deleted).
  const scope = useMemo<Scope>(() => {
    if (!allClients || !allUnits) return chosen;
    const ids = new Set(clients.map((c) => c.id));
    let clientId = chosen.clientId && ids.has(chosen.clientId) ? chosen.clientId : null;
    if (!clientId && !me.isFirm) clientId = clients[0]?.id ?? me.clients[0]?.id ?? null;
    const unitOk =
      clientId !== null &&
      chosen.unitId !== null &&
      allUnits.some((u) => u.id === chosen.unitId && u.clienteId === clientId);
    return { clientId, unitId: unitOk ? chosen.unitId : null };
  }, [chosen, clients, allClients, allUnits, me]);

  useEffect(() => {
    try {
      localStorage.setItem(key(me.id), JSON.stringify(scope));
    } catch {
      /* private mode */
    }
  }, [scope, me.id]);

  const setClient = useCallback((clientId: string | null) => {
    setChosen({ clientId, unitId: null });
  }, []);
  const setUnit = useCallback((unitId: string | null) => {
    setChosen((s) => ({ ...s, unitId }));
  }, []);

  const value = useMemo<ScopeContextValue>(() => {
    const entidades = (allUnits ?? []).filter((u) => u.clienteId === scope.clientId);
    return {
      scope,
      setClient,
      setUnit,
      clients,
      access: me.clients.find((c) => c.id === scope.clientId) ?? null,
      entidades,
      units: unitsUnder(scope.unitId, entidades),
    };
  }, [scope, setClient, setUnit, clients, allUnits, me]);

  return <ScopeContext value={value}>{children}</ScopeContext>;
}
