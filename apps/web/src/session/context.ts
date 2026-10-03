import { createContext, use } from 'react';
import {
  text,
  type BootstrapData,
  type ClientSummary,
  type Lado,
  type Rol,
} from '@empirica/shared';
import type { AuthUser } from '../auth/types.ts';
import type { PortalDb } from '../data/db.ts';
import type { Caller, SyncEngine } from '../sync/engine.ts';

/** What the screens know about the person using the portal. */
export interface Me {
  id: string;
  name: string;
  email: string;
  lado: Lado;
  rolBase: Rol;
  isAdmin: boolean;
  isFirm: boolean;
  clients: ClientSummary[];
  /** Public settings (Config with publica = true), by key. */
  config: Readonly<Record<string, string>>;
}

export type SessionState =
  | { status: 'starting' }
  | { status: 'signedOut' }
  | { status: 'unverified'; authUser: AuthUser }
  | { status: 'noAccess'; authUser: AuthUser; reason: string | null }
  /** Offline for longer than allowed (D20): the data stays hidden until the server answers. */
  | { status: 'reauth'; authUser: AuthUser; days: number }
  /** First use of this device without network: nothing to show yet. */
  | { status: 'needsNetwork'; authUser: AuthUser }
  | { status: 'outdated' }
  | { status: 'failed'; message: string }
  | {
      status: 'ready';
      authUser: AuthUser;
      me: Me;
      db: PortalDb;
      engine: SyncEngine;
      call: Caller;
      /** True while the session is locked for inactivity. */
      locked: boolean;
    };

export interface SessionContextValue {
  state: SessionState;
  /** Tries again (after a network or access problem). */
  retry: () => void;
  unlock: (password?: string) => Promise<void>;
  signOut: (options: { keepData: boolean }) => Promise<void>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession needs a <SessionProvider>');
  return value;
}

/** The ready session; only for screens rendered inside the portal. */
export function usePortal(): Extract<SessionState, { status: 'ready' }> {
  const { state } = useSession();
  if (state.status !== 'ready') throw new Error('usePortal outside a ready session');
  return state;
}

export function meFrom(boot: BootstrapData): Me {
  const user = boot.user;
  const lado: Lado = user.lado === 'CLIENTE' ? 'CLIENTE' : 'EMPIRICA';
  const rolBase = (text(user, 'rolBase') ?? 'CLIENTE_LECTURA') as Rol;
  const config: Record<string, string> = {};
  for (const row of boot.config) {
    if (typeof row.clave === 'string' && typeof row.valor === 'string')
      config[row.clave] = row.valor;
  }
  return {
    id: user.id,
    name: typeof user.nombre === 'string' ? user.nombre : '',
    email: typeof user.email === 'string' ? user.email : '',
    lado,
    rolBase,
    isAdmin: lado === 'EMPIRICA' && rolBase === 'SOCIO_ADMIN',
    isFirm: lado === 'EMPIRICA',
    clients: boot.clients,
    config,
  };
}

export function configNumber(me: Me, key: string, fallback: number): number {
  const value = Number(me.config[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
