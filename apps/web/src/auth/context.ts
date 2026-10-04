import { createContext, use } from 'react';
import type { AuthClient, AuthUser } from './types.ts';

export type AuthState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser };

export interface AuthContextValue {
  state: AuthState;
  client: AuthClient;
  /** After the user confirms their email elsewhere. */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth needs an <AuthProvider>');
  return value;
}
