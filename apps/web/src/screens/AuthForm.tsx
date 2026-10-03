import { useEffect, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.ts';
import { listDemoUsers, type DemoUser } from '../auth/mock.ts';
import { AuthError } from '../auth/types.ts';
import googleG from '../assets/google-g.svg';
import { MOCK_MODE } from '../config/api.ts';
import { Button } from '../ui/Button.tsx';
import { TextField } from '../ui/Field.tsx';

type Mode = 'signIn' | 'signUp' | 'reset';

/**
 * Signing in with email and password, or Google; creating an account (for
 * invited people); and resetting a password. In mock mode, demo users.
 */
export function AuthForm({ initialMode = 'signIn' }: { initialMode?: 'signIn' | 'signUp' }) {
  if (MOCK_MODE) return <MockSignIn />;
  return <FirebaseForm initialMode={initialMode} />;
}

function FirebaseForm({ initialMode }: { initialMode: Mode }) {
  const { t } = useTranslation();
  const { client } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fail = (e: unknown): void => {
    const code = e instanceof AuthError ? e.code : 'unknown';
    setError(t(`auth.errors.${code}`));
  };

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

  const google = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await client.signInWithGoogle();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
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
            disabled={busy}
          >
            <GoogleMark />
            {t('auth.google')}
          </Button>
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

function MockSignIn() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    void listDemoUsers().then(setUsers);
  }, []);
  const enter = async (address: string): Promise<void> => {
    setBusy(address);
    try {
      await client.signInWithPassword(address, 'demo');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="rounded-card border border-border bg-card p-6 text-card-foreground shadow-card">
      <p className="label-caps text-muted-foreground">{t('auth.mock.title')}</p>
      <h1 className="mt-1 text-3xl font-semibold">{t('auth.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('auth.mock.subtitle')}</p>
      <ul className="mt-4 divide-y divide-border rounded-control border border-border">
        {users.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted"
              onClick={() => void enter(u.email)}
              disabled={busy !== null}
            >
              <span>
                <span className="block font-medium">{u.nombre}</span>
                <span className="block text-sm text-muted-foreground">{u.email}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {t(`roles.${u.rolBase as 'SOCIO_ADMIN'}`)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void enter(email);
        }}
      >
        <TextField
          label={t('auth.mock.other')}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <Button type="submit" variant="secondary" busy={busy === email && email !== ''}>
          {t('auth.mock.enter')}
        </Button>
      </form>
    </div>
  );
}
