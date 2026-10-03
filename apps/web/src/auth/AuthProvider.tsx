import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue, type AuthState } from './context.ts';
import type { AuthClient } from './types.ts';

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  useEffect(
    () =>
      client.subscribe((user) => {
        setState(user ? { status: 'signedIn', user } : { status: 'signedOut' });
      }),
    [client],
  );
  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      client,
      refresh: async () => {
        const user = await client.reload();
        setState(user ? { status: 'signedIn', user } : { status: 'signedOut' });
      },
    }),
    [state, client],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
