import { useCallback, useEffect, useState } from 'react';
import type { InvitationView, InvitationsListData } from '@empirica/shared';
import { ApiCallError, NetworkError } from '../../api/client.ts';
import { useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';

export type InvitationsState =
  | { status: 'loading' }
  | { status: 'offline' }
  | { status: 'error'; code: string }
  | { status: 'ready'; invitations: InvitationView[] };

/**
 * Invitations live only on the server (they carry access): they are read
 * online, and the screen says so when there is no network.
 */
export function useInvitations(clienteId: string | null): {
  state: InvitationsState;
  reload: () => void;
} {
  const { call } = usePortal();
  const [state, setState] = useState<InvitationsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    call<InvitationsListData>('invitations.list', clienteId ? { clienteId } : {})
      .then(({ data }) => {
        if (!cancelled) setState({ status: 'ready', invitations: data.invitations });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof NetworkError) setState({ status: 'offline' });
        else
          setState({
            status: 'error',
            code: error instanceof ApiCallError ? error.code : 'UNKNOWN',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [call, clienteId, attempt]);
  const reload = useCallback(() => {
    setAttempt((a) => a + 1);
  }, []);
  return { state, reload };
}

/** The link the invited person opens: the portal's address with the secret after the #. */
export function invitationLink(token: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}#/invitacion/${token}`;
}

/**
 * Clients for which this user may invite people: the partner, any; a lawyer,
 * those assigned to them; a client admin, their company (pending approval).
 */
export function useInvitableClients(): string[] {
  const { me } = usePortal();
  const { clients } = useScope();
  if (me.isAdmin) return clients.map((c) => c.id);
  return me.clients
    .filter((c) => c.rol === 'ABOGADO' || c.rol === 'CLIENTE_ADMIN')
    .map((c) => c.id);
}
