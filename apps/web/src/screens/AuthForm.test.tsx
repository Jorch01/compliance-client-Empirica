/**
 * Signing in (F7): waiting for Google never blocks the email form, and in
 * the app installed on an iPhone, where Google's window may never come back,
 * the portal turns to email and password on its own. There, coming back
 * from Google without the account says why and offers the email (D78).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import { AuthError, type GooglePurpose } from '../auth/types.ts';
import { fakeAuth } from '../test/fakeAuth.ts';
import { AuthForm } from './AuthForm.tsx';

const platform = vi.hoisted(() => ({ installed: false, ios: false }));
vi.mock('../portal/install.ts', () => ({
  isInstalled: () => platform.installed,
  detectPlatform: () => (platform.ios ? 'ios' : 'desktop'),
}));

function renderForm(
  signInWithGoogle: () => Promise<void>,
  finishGoogleRedirect: (purpose: GooglePurpose) => Promise<boolean> = () => Promise.resolve(false),
) {
  const client = { ...fakeAuth(null), signInWithGoogle, finishGoogleRedirect };
  render(
    <AuthProvider client={client}>
      <AuthForm />
    </AuthProvider>,
  );
  return {
    google: () => screen.getByRole('button', { name: /Continuar con Google/ }),
    email: () => screen.getByLabelText('Correo electrónico'),
    submit: () => screen.getByRole('button', { name: 'Entrar' }),
  };
}

const never = (): Promise<void> => new Promise(() => undefined);

describe('signing in while Google takes its time', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    platform.installed = false;
    platform.ios = false;
  });

  it('the email form stays usable while Google’s window is open', () => {
    const form = renderForm(never);
    fireEvent.click(form.google());
    expect(form.google()).toBeDisabled();
    expect(form.email()).toBeEnabled();
    expect(form.submit()).toBeEnabled();
  });

  it('in the app installed on iPhone, after 15 seconds without Google, it goes to the email', () => {
    platform.installed = true;
    platform.ios = true;
    const form = renderForm(never);
    expect(screen.getByText(/si Google no responde/)).toBeInTheDocument();
    fireEvent.click(form.google());
    act(() => {
      vi.advanceTimersByTime(14_000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Google no respondió dentro de la app instalada',
    );
    expect(form.email()).toHaveFocus();
  });

  it('there, a Google failure also goes straight to the email', async () => {
    platform.installed = true;
    platform.ios = true;
    const form = renderForm(() => Promise.reject(new AuthError('popup-blocked')));
    await act(async () => {
      fireEvent.click(form.google());
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Entra con tu correo y contraseña');
    expect(form.email()).toHaveFocus();
    expect(form.google()).toBeEnabled();
  });

  it('elsewhere a Google failure says what happened', async () => {
    const form = renderForm(() => Promise.reject(new AuthError('popup-blocked')));
    await act(async () => {
      fireEvent.click(form.google());
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El navegador bloqueó la ventana de Google',
    );
  });
});

describe('back from Google in the app installed on iPhone (D78)', () => {
  afterEach(() => {
    platform.installed = false;
    platform.ios = false;
  });

  it('without the account: what happened, and straight to the email', async () => {
    platform.installed = true;
    platform.ios = true;
    const form = renderForm(never, (purpose) =>
      purpose === 'signIn' ? Promise.reject(new AuthError('popup-closed')) : Promise.resolve(false),
    );
    expect(await screen.findByText(/Se cerró la ventana de Google/)).toBeInTheDocument();
    expect(screen.getByText(/Google no respondió dentro de la app instalada/)).toBeInTheDocument();
    expect(form.email()).toHaveFocus();
  });

  it('any other page load: nothing to say', async () => {
    renderForm(never);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
