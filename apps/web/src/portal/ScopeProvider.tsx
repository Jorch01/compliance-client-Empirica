import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { isBillingOnly } from '@empirica/shared';
import { useRows } from '../data/hooks.ts';
import { unitsUnder, type Scope } from '../domain/scope.ts';
import { usePortal } from '../session/context.ts';
import { ScopeContext, clientName, type ScopeContextValue } from './scope.ts';

const key = (userId: string): string => `empirica.scope.${userId}`;

/**
 * The screens where a client the firm only bills (D87) can be chosen:
 * billing, and the clients' cards. Everywhere else it does not exist.
 */
const billingView = (path: string): boolean =>
  path === '/clientes' || path === '/cobranza' || path.startsWith('/cobranza/');

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
 * has one client selected (usually their only one). A client the firm only
 * bills is there only in billing and in the clients' cards (D87).
 */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const { me } = usePortal();
  const [path] = useLocation();
  const withBillingOnly = billingView(path);
  const [chosen, setChosen] = useState<Scope>(() => load(me.id));
  const allClients = useRows('Clientes');
  const allUnits = useRows('Entidades');

  const clients = useMemo(() => {
    const allowed = new Set(me.clients.map((c) => c.id));
    return (allClients ?? [])
      .filter((c) => me.isFirm || allowed.has(c.id))
      .filter((c) => withBillingOnly || !isBillingOnly(c))
      .sort((a, b) => clientName(a).localeCompare(clientName(b), 'es'));
  }, [allClients, me, withBillingOnly]);

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

  // A billing-only client is still the one chosen while another screen hides it.
  const hiddenHere =
    !withBillingOnly &&
    (allClients ?? []).some((c) => c.id === chosen.clientId && isBillingOnly(c));
  const remembered = hiddenHere ? chosen : scope;
  useEffect(() => {
    try {
      localStorage.setItem(key(me.id), JSON.stringify(remembered));
    } catch {
      /* private mode */
    }
  }, [remembered, me.id]);

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
