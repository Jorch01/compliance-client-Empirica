/**
 * Demo sign-in for the mock mode (npm run dev:mock): no Firebase, no
 * Google. The mock API issues ID tokens for any e-mail, always verified,
 * that the real backend code (running in the dev server) accepts.
 */
import { AuthError, type AuthClient, type AuthUser } from './types.ts';

export interface DemoUser {
  id: string;
  email: string;
  nombre: string;
  lado: string;
  rolBase: string;
}

const KEY = 'empirica.mockUser';
const BASE = '/mock-api';

interface Stored {
  user: AuthUser;
  token: string;
  /** Milliseconds since the epoch. */
  expiresAt: number;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('network');
  }
  if (!response.ok) throw new AuthError('unknown');
  return (await response.json()) as T;
}

export async function listDemoUsers(): Promise<DemoUser[]> {
  const response = await fetch(`${BASE}/users`);
  return response.ok ? ((await response.json()) as DemoUser[]) : [];
}

export function createMockAuth(): AuthClient {
  const listeners = new Set<(user: AuthUser | null) => void>();
  let current: Stored | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    current = raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    current = null;
  }
  const emit = (): void => {
    for (const l of listeners) l(current?.user ?? null);
  };
  // Read through a function: someone may sign out while a token is renewed.
  const token = (): string | null => current?.token ?? null;
  const save = (stored: Stored | null): void => {
    current = stored;
    try {
      if (stored) localStorage.setItem(KEY, JSON.stringify(stored));
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode */
    }
    emit();
  };
  const signIn = async (email: string, name?: string): Promise<void> => {
    const issued = await post<{ token: string; uid: string; email: string; nombre: string | null }>(
      '/token',
      { email: email.trim().toLowerCase() },
    );
    save({
      user: {
        uid: issued.uid,
        email: issued.email,
        emailVerified: true,
        name: name ?? issued.nombre,
        providers: ['password'],
      },
      token: issued.token,
      expiresAt: Date.now() + 55 * 60_000,
    });
  };

  return {
    kind: 'mock',
    subscribe: (listener) => {
      listeners.add(listener);
      queueMicrotask(() => {
        listener(current?.user ?? null);
      });
      return () => listeners.delete(listener);
    },
    getIdToken: async (forceRefresh = false) => {
      if (!current) return null;
      if (forceRefresh || current.expiresAt < Date.now()) {
        await signIn(current.user.email, current.user.name ?? undefined);
      }
      return token();
    },
    signInWithPassword: (email) => signIn(email),
    signUpWithPassword: (email, _password, name) => signIn(email, name),
    signInWithGoogle: () => Promise.reject(new AuthError('not-allowed')),
    sendVerification: () => Promise.resolve(),
    reload: () => Promise.resolve(current?.user ?? null),
    resetPassword: () => Promise.resolve(),
    signOut: () => {
      save(null);
      return Promise.resolve();
    },
  };
}
