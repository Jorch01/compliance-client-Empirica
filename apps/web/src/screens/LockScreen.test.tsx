/**
 * The lock screen of a Google account (D78): in the app installed on an
 * iPhone, unlocking goes to Google and comes back; if it did not get done,
 * the screen says why.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import { AuthError, type AuthUser, type GooglePurpose } from '../auth/types.ts';
import { SessionContext, type SessionContextValue } from '../session/context.ts';
import { fakeAuth } from '../test/fakeAuth.ts';
import { LockScreen } from './StateScreens.tsx';

const user: AuthUser = {
  uid: 'u1',
  email: 'persona@cliente.example',
  emailVerified: true,
  name: 'Persona',
  providers: ['google.com'],
};

function renderLock(finishGoogleRedirect: (purpose: GooglePurpose) => Promise<boolean>) {
  const session: SessionContextValue = {
    state: { status: 'starting' },
    retry: vi.fn(),
    unlock: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(() => Promise.resolve()),
  };
  render(
    <AuthProvider client={{ ...fakeAuth(user), finishGoogleRedirect }}>
      <SessionContext value={session}>
        <LockScreen user={user} minutes={30} />
      </SessionContext>
    </AuthProvider>,
  );
}

describe('the lock screen of a Google account (D78)', () => {
  it('back from Google without unlocking: why', async () => {
    renderLock((purpose) =>
      purpose === 'unlock' ? Promise.reject(new AuthError('popup-closed')) : Promise.resolve(false),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Se cerró la ventana de Google');
    expect(screen.getByRole('button', { name: /Google/ })).toBeEnabled();
  });

  it('any other page load: nothing to say', async () => {
    renderLock(() => Promise.resolve(false));
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
