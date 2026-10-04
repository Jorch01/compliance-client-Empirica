import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dexie } from 'dexie';
import type { BootstrapData } from '@empirica/shared';
import { ApiCallError } from '../api/client.ts';
import { useAuth } from '../auth/context.ts';
import type { AuthUser } from '../auth/types.ts';
import { MOCK_MODE } from '../config/api.ts';
import { dbName, openDb, type PortalDb } from '../data/db.ts';
import { recordError } from '../feedback/diagnostics.ts';
import { META, SyncEngine, type Caller } from '../sync/engine.ts';
import { makeCaller } from './caller.ts';
import {
  SessionContext,
  configNumber,
  meFrom,
  type Me,
  type SessionContextValue,
  type SessionState,
} from './context.ts';
import { useIdle } from './idle.ts';

const BOOT = 'bootstrap';
const DAY_MS = 86_400_000;
const lockKey = (uid: string): string => `empirica.locked.${uid}`;

function readFlag(name: string): boolean {
  try {
    return localStorage.getItem(name) === '1';
  } catch {
    return false;
  }
}

function writeFlag(name: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(name, '1');
    else localStorage.removeItem(name);
  } catch {
    /* private mode */
  }
}

/** The mock API keeps its data in memory: after a restart, local copies are stale. */
async function forgetIfMockRestarted(): Promise<void> {
  try {
    const { instance } = (await (await fetch('/mock-api/instance')).json()) as { instance: string };
    const known = localStorage.getItem('empirica.mockInstance');
    if (known && known !== instance) {
      for (const name of await Dexie.getDatabaseNames()) {
        if (name.startsWith('empirica-')) await Dexie.delete(name);
      }
    }
    localStorage.setItem('empirica.mockInstance', instance);
  } catch {
    /* the mock API is down: nothing to compare */
  }
}

type Begin = { boot: BootstrapData } | { failure: SessionState };

/**
 * Who the user is for the portal (session.bootstrap). Without network the
 * last known answer serves, but only for as many days as the firm allows
 * (D20); a device never used online has nothing to show.
 */
async function begin(db: PortalDb, call: Caller, authUser: AuthUser): Promise<Begin> {
  const cached = (await db.meta.get(BOOT))?.value as BootstrapData | undefined;
  try {
    const { data } = await call<BootstrapData>('session.bootstrap', {});
    if (cached && cached.user.id !== data.user.id) {
      await Promise.all(db.tables.map((t) => t.clear()));
    }
    await db.meta.bulkPut([
      { key: BOOT, value: data },
      { key: META.lastContact, value: Date.now() },
    ]);
    return { boot: data };
  } catch (error) {
    if (error instanceof ApiCallError) {
      switch (error.code) {
        case 'NOT_WHITELISTED':
          return { failure: { status: 'noAccess', authUser, reason: error.reason ?? null } };
        case 'EMAIL_NOT_VERIFIED':
          return { failure: { status: 'unverified', authUser } };
        case 'UNAUTHENTICATED':
          return {
            failure: { status: 'noAccess', authUser, reason: error.reason ?? 'UNAUTHENTICATED' },
          };
        case 'CLIENT_TOO_OLD':
          return { failure: { status: 'outdated' } };
        default:
          if (!cached) return { failure: { status: 'failed', message: error.message } };
      }
    }
    if (!cached) return { failure: { status: 'needsNetwork', authUser } };
    const days = configNumber(meFrom(cached), 'diasSinConexion', 14);
    const last = (await db.meta.get(META.lastContact))?.value;
    if (typeof last !== 'number' || Date.now() - last > days * DAY_MS) {
      return { failure: { status: 'reauth', authUser, days } };
    }
    return { boot: cached };
  }
}

interface Running {
  uid: string;
  db: PortalDb;
  engine: SyncEngine;
  call: Caller;
  me: Me;
  stop: () => void;
}

/** The result of opening the session for one account and attempt. */
type Outcome = { key: string } & ({ running: Running } | { failure: SessionState });

export function SessionProvider({ children }: { children: ReactNode }) {
  const { state: auth, client } = useAuth();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [locked, setLocked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const authUser = auth.status === 'signedIn' ? auth.user : null;
  const authRef = useRef(authUser);
  useEffect(() => {
    authRef.current = authUser;
  }, [authUser]);
  const uid = authUser?.uid ?? null;
  const verified = authUser?.emailVerified ?? false;
  // Each account and each new attempt opens the session again.
  const key = uid && verified ? `${uid}|${String(attempt)}` : null;

  useEffect(() => {
    const user = authRef.current;
    if (!key || !uid || !user) return;
    const abort = new AbortController();
    // A function, so each check reads the flag again after an await.
    const aborted = (): boolean => abort.signal.aborted;
    let db: PortalDb | null = null;
    let stop: (() => void) | null = null;
    void (async () => {
      if (MOCK_MODE) await forgetIfMockRestarted();
      if (aborted()) return;
      db = openDb(uid);
      const call = makeCaller(client);
      let begun: Begin;
      try {
        begun = await begin(db, call, user);
      } catch (error) {
        // The cleanup below closed the database (another account or attempt): nothing to tell.
        if (aborted()) return;
        recordError(error, 'session');
        begun = {
          failure: {
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
      if (aborted()) return;
      if ('failure' in begun) {
        setOutcome({ key, failure: begun.failure });
        return;
      }
      const engine = new SyncEngine({
        db,
        call,
        userId: begun.boot.user.id,
        // Access withdrawn, account changed or app too old: ask the server again.
        onAuthError: () => {
          setAttempt((a) => a + 1);
        },
      });
      stop = engine.start();
      setLocked(readFlag(lockKey(uid)));
      setOutcome({
        key,
        running: { uid, db, engine, call, me: meFrom(begun.boot), stop },
      });
    })();
    return () => {
      abort.abort();
      stop?.();
      db?.close();
    };
  }, [key, uid, client]);

  const running = outcome?.key === key && 'running' in outcome ? outcome.running : null;

  // After a sync that changed the clients the user may open, refresh who they are.
  useEffect(() => {
    if (!running) return;
    const { engine, db, call } = running;
    let last = engine.getStatus().lastSyncAt;
    return engine.subscribe(() => {
      const status = engine.getStatus();
      if (status.phase !== 'idle' || status.lastSyncAt === last) return;
      last = status.lastSyncAt;
      void (async () => {
        const authorized =
          ((await db.meta.get(META.authorized))?.value as string[] | undefined) ?? [];
        const known = running.me.clients.map((c) => c.id);
        const same =
          authorized.length === known.length && authorized.every((id) => known.includes(id));
        if (same) return;
        try {
          const { data } = await call<BootstrapData>('session.bootstrap', {});
          await db.meta.put({ key: BOOT, value: data });
          setOutcome((o) =>
            o && 'running' in o && o.running.engine === engine
              ? { ...o, running: { ...o.running, me: meFrom(data) } }
              : o,
          );
        } catch {
          /* next sync will try again */
        }
      })();
    });
  }, [running]);

  const lock = useCallback(() => {
    if (!running) return;
    writeFlag(lockKey(running.uid), true);
    setLocked(true);
  }, [running]);
  useIdle(
    running ? configNumber(running.me, 'inactividadMinutos', 30) : 30,
    running !== null && !locked,
    lock,
  );

  const value = useMemo<SessionContextValue>(() => {
    let state: SessionState;
    if (auth.status === 'loading') state = { status: 'starting' };
    else if (!authUser) state = { status: 'signedOut' };
    else if (!authUser.emailVerified) state = { status: 'unverified', authUser };
    else if (running) {
      state = {
        status: 'ready',
        authUser,
        me: running.me,
        db: running.db,
        engine: running.engine,
        call: running.call,
        locked,
      };
    } else if (outcome?.key === key && 'failure' in outcome) state = outcome.failure;
    else state = { status: 'starting' };
    return {
      state,
      retry: () => {
        setAttempt((a) => a + 1);
      },
      unlock: async (password) => {
        await client.reauthenticate(password);
        if (running) writeFlag(lockKey(running.uid), false);
        setLocked(false);
      },
      signOut: async ({ keepData }) => {
        if (running) {
          running.stop();
          writeFlag(lockKey(running.uid), false);
          running.db.close();
          if (!keepData) await Dexie.delete(dbName(running.uid));
        }
        setOutcome(null);
        setLocked(false);
        await client.signOut();
      },
    };
  }, [auth.status, authUser, running, outcome, key, locked, client]);

  return <SessionContext value={value}>{children}</SessionContext>;
}
