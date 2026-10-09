import { lazy, Suspense, useEffect, useRef, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.ts';
import { authErrorText } from '../auth/error-text.ts';

import googleG from '../assets/google-g.svg';
import { MOCK_MODE } from '../config/api.ts';
import { detectPlatform, isInstalled } from '../portal/install.ts';
import { Button } from '../ui/Button.tsx';
import { Spinner } from '../ui/Card.tsx';
import { TextField } from '../ui/Field.tsx';

// Demo accounts exist only in mock mode: their code never reaches the real portal.
const MockSignIn = lazy(() => import('./MockSignIn.tsx').then((m) => ({ default: m.MockSignIn })));

type Mode = 'signIn' | 'signUp' | 'reset';

/** How long the installed app on iPhone waits for Google before offering the email instead. */
const GOOGLE_PATIENCE_MS = 15_000;

/**
 * Signing in with email and password, or Google; creating an account (for
 * invited people); and resetting a password. In mock mode, demo users.
 */
export function AuthForm({ initialMode = 'signIn' }: { initialMode?: 'signIn' | 'signUp' }) {
  const { t } = useTranslation();
  if (MOCK_MODE) {
    return (
      <Suspense fallback={<Spinner label={t('app.loading')} />}>
        <MockSignIn />
      </Suspense>
    );
  }
  return <FirebaseForm initialMode={initialMode} />;
}

function FirebaseForm({ initialMode }: { initialMode: Mode }) {
  const { t } = useTranslation();
  const onInstalledIos = isInstalled() && detectPlatform() === 'ios';
  const { client } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleStuck, setGoogleStuck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  const fail = (e: unknown): void => {
    setError(authErrorText(t, e));
  };

  // Back from Google on the installed iPhone app (D78): what went wrong, and the email.
  useEffect(() => {
    let current = true;
    client.finishGoogleRedirect('signIn').catch((e: unknown) => {
      if (!current) return;
      setError(authErrorText(t, e));
      if (onInstalledIos) {
        setGoogleStuck(true);
        emailInput.current?.focus();
      }
    });
    return () => {
      current = false;
    };
  }, [client, t, onInstalledIos]);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === 'signUp' && password.length < 8) {
      setError(t('auth.errors.weak-password'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signIn') await client.signInWithPassword(email, password);
      else if (mode === 'signUp') await client.signUpWithPassword(email, password, name);
      else {
        await client.resetPassword(email);
        setNotice(t('auth.resetSent'));
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  /** Google did not answer in the installed app on iPhone: straight to email and password. */
  const toEmail = (): void => {
    setGoogleStuck(true);
    emailInput.current?.focus();
  };

  // Waiting for Google never blocks the email form: its window may never come back.
  const google = async (): Promise<void> => {
    setError(null);
    setGoogleStuck(false);
    setGoogleBusy(true);
    const patience = onInstalledIos ? setTimeout(toEmail, GOOGLE_PATIENCE_MS) : undefined;
    try {
      await client.signInWithGoogle();
    } catch (e) {
      if (onInstalledIos) toEmail();
      else fail(e);
    } finally {
      clearTimeout(patience);
      setGoogleBusy(false);
    }
  };

  const heading =
    mode === 'signIn'
      ? t('auth.title')
      : mode === 'signUp'
        ? t('auth.createAccount')
        : t('auth.resetTitle');

  return (
    <div className="rounded-card border border-border bg-card p-6 text-card-foreground shadow-card">
      <h1 className="text-3xl font-semibold">{heading}</h1>
      {mode === 'reset' ? (
        <p className="mt-2 text-muted-foreground">{t('auth.resetBody')}</p>
      ) : null}
      {mode !== 'reset' ? (
        <>
          <Button
            variant="secondary"
            className="mt-5 w-full"
            onClick={() => void google()}
            disabled={busy || googleBusy}
            aria-busy={googleBusy || undefined}
          >
            <GoogleMark />
            {t('auth.google')}
          </Button>
          {googleStuck ? (
            <p
              role="alert"
              className="mt-2 rounded-control border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground"
            >
              {t('auth.googleIosStuck')}
            </p>
          ) : onInstalledIos ? (
            <p className="mt-2 text-sm text-muted-foreground">{t('auth.googleIosHint')}</p>
          ) : null}
          <div className="my-5 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}
      <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate>
        {mode === 'signUp' ? (
          <TextField
            label={t('auth.yourName')}
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        ) : null}
        <TextField
          ref={emailInput}
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        {mode !== 'reset' ? (
          <TextField
            label={mode === 'signUp' ? t('auth.newPassword') : t('auth.password')}
            type="password"
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            required
            hint={mode === 'signUp' ? t('auth.passwordHint') : undefined}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="rounded-control border border-success-border bg-success-subtle px-3 py-2 text-sm text-success-subtle-foreground"
          >
            {notice}
          </p>
        ) : null}
        <Button
          type="submit"
          className="w-full"
          busy={busy}
          busyLabel={mode === 'signUp' ? t('auth.creatingAccount') : t('auth.signingIn')}
        >
          {mode === 'signIn'
            ? t('auth.signIn')
            : mode === 'signUp'
              ? t('auth.createAccount')
              : t('auth.resetSend')}
        </Button>
      </form>
      <div className="mt-5 flex flex-col items-start gap-2 text-sm">
        {mode === 'signIn' ? (
          <>
            <LinkButton
              onClick={() => {
                setMode('reset');
              }}
            >
              {t('auth.forgotPassword')}
            </LinkButton>
            <LinkButton
              onClick={() => {
                setMode('signUp');
              }}
            >
              {t('auth.noAccount')}
            </LinkButton>
          </>
        ) : (
          <LinkButton
            onClick={() => {
              setMode('signIn');
            }}
          >
            {t('auth.haveAccount')}
          </LinkButton>
        )}
      </div>
      <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
        {t('auth.invitationOnly')}
      </p>
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="text-link underline underline-offset-2">
      {children}
    </button>
  );
}

/** Google's "G" (a third-party mark in its own colors: src/assets, not our palette). */
function GoogleMark() {
  return <img src={googleG} alt="" className="size-5" />;
}
