import type { AuthClient, AuthUser } from '../auth/types.ts';

/**
 * A sign-in provider for screen tests: starts with `user` (or signed out)
 * and hands out whatever token `token()` gives for the backend under test.
 */
export function fakeAuth(
  user: AuthUser | null,
  token: () => string | null = () => null,
): AuthClient & { emit: (next: AuthUser | null) => void } {
  let current = user;
  const listeners = new Set<(u: AuthUser | null) => void>();
  const emit = (next: AuthUser | null): void => {
    current = next;
    for (const l of listeners) l(next);
  };
  return {
    kind: 'mock',
    emit,
    subscribe: (listener) => {
      listeners.add(listener);
      queueMicrotask(() => {
        listener(current);
      });
      return () => listeners.delete(listener);
    },
    getIdToken: () => Promise.resolve(current ? token() : null),
    signInWithPassword: () => Promise.resolve(),
    signUpWithPassword: () => Promise.resolve(),
    signInWithGoogle: () => Promise.resolve(),
    sendVerification: () => Promise.resolve(),
    reload: () => Promise.resolve(current),
    resetPassword: () => Promise.resolve(),
    addPassword: () => Promise.resolve(),
    reauthenticate: () => Promise.resolve(),
    signOut: () => {
      emit(null);
      return Promise.resolve();
    },
  };
}
