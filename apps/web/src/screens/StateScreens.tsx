/**
 * Everything the portal may show before (or instead of) the data: signing
 * in, confirming the email, no access, offline too long, outdated app,
 * locked for inactivity.
 */
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.ts';
import { AuthError, type AuthUser } from '../auth/types.ts';
import { MOCK_MODE } from '../config/api.ts';
import { reloadToNewVersion } from '../pwa/update.ts';
import { useSession } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Spinner } from '../ui/Card.tsx';
import { TextField } from '../ui/Field.tsx';
import { Icon } from '../ui/Icon.tsx';
import { AuthForm } from './AuthForm.tsx';
import { AuthLayout, MessageScreen } from './AuthLayout.tsx';

export function StartingScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Spinner label={t('session.starting')} />
    </div>
  );
}

export function LoginScreen() {
  return (
    <AuthLayout>
      <AuthForm />
    </AuthLayout>
  );
}

function SignOutButton() {
  const { t } = useTranslation();
  const { client } = useAuth();
  return (
    <Button variant="ghost" icon="logOut" onClick={() => void client.signOut()}>
      {t('auth.useOtherAccount')}
    </Button>
  );
}

export function VerifyEmailScreen({ user }: { user: AuthUser }) {
  const { t } = useTranslation();
  const { client, refresh } = useAuth();
  const [busy, setBusy] = useState<'check' | 'send' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <MessageScreen
      title={t('auth.verifyTitle')}
      actions={
        <>
          <Button
            busy={busy === 'check'}
            onClick={() => {
              setBusy('check');
              setMessage(null);
              void refresh()
                .then(() => {
                  setMessage(t('auth.verifyStill'));
                })
                .finally(() => {
                  setBusy(null);
                });
            }}
          >
            {t('auth.verifyDone')}
          </Button>
          <Button
            variant="secondary"
            busy={busy === 'send'}
            onClick={() => {
              setBusy('send');
              void client
                .sendVerification()
                .then(() => {
                  setMessage(t('auth.verifySent'));
                })
                .catch((e: unknown) => {
                  setMessage(t(`auth.errors.${e instanceof AuthError ? e.code : 'unknown'}`));
                })
                .finally(() => {
                  setBusy(null);
                });
            }}
          >
            {t('auth.verifyResend')}
          </Button>
          <SignOutButton />
        </>
      }
    >
      <p>{t('auth.verifyBody', { email: user.email })}</p>
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </MessageScreen>
  );
}

export function NoAccessScreen({ user, reason }: { user: AuthUser; reason: string | null }) {
  const { t } = useTranslation();
  const { retry } = useSession();
  const body =
    reason === 'INVITADO'
      ? t('access.invitedBody')
      : reason === 'INACTIVO'
        ? t('access.inactiveBody')
        : reason === 'ACCOUNT_CHANGED'
          ? t('access.accountChanged')
          : t('access.deniedBody', { email: user.email });
  return (
    <MessageScreen
      title={t('access.deniedTitle')}
      actions={
        <>
          <Button variant="secondary" icon="refresh" onClick={retry}>
            {t('access.tryAgain')}
          </Button>
          <SignOutButton />
        </>
      }
    >
      <p>{body}</p>
    </MessageScreen>
  );
}

export function ReauthScreen({ days }: { days: number }) {
  const { t } = useTranslation();
  const { retry } = useSession();
  return (
    <MessageScreen
      title={t('lock.reauthTitle')}
      actions={
        <>
          <Button icon="refresh" onClick={retry}>
            {t('common.retry')}
          </Button>
          <SignOutButton />
        </>
      }
    >
      <p>{t('lock.reauthBody', { days })}</p>
    </MessageScreen>
  );
}

/** Inside another site's page, where a click could be tricked: the portal only offers to open itself. */
export function FramedScreen({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <MessageScreen
      title={t('framed.title')}
      actions={
        <a href={href} target="_blank" rel="noopener" className={buttonClass('primary')}>
          {t('framed.open')}
        </a>
      }
    >
      <p>{t('framed.body')}</p>
    </MessageScreen>
  );
}

export function NeedsNetworkScreen() {
  const { t } = useTranslation();
  const { retry } = useSession();
  return (
    <MessageScreen
      title={t('session.needsNetworkTitle')}
      actions={
        <Button icon="refresh" onClick={retry}>
          {t('common.retry')}
        </Button>
      }
    >
      <p>{t('session.needsNetworkBody')}</p>
    </MessageScreen>
  );
}

export function OutdatedScreen() {
  const { t } = useTranslation();
  return (
    <MessageScreen
      title={t('session.outdatedTitle')}
      actions={
        <Button icon="refresh" onClick={() => void reloadToNewVersion()}>
          {t('session.reload')}
        </Button>
      }
    >
      <p>{t('session.outdatedBody')}</p>
    </MessageScreen>
  );
}

export function FailedScreen({ message }: { message: string }) {
  const { t } = useTranslation();
  const { retry } = useSession();
  return (
    <MessageScreen
      title={t('session.failedTitle')}
      actions={
        <>
          <Button icon="refresh" onClick={retry}>
            {t('common.retry')}
          </Button>
          <SignOutButton />
        </>
      }
    >
      <p>{t('session.failedBody')}</p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </MessageScreen>
  );
}

/** Locked after inactivity: the data stays, the person proves it is them again. */
export function LockScreen({ user, minutes }: { user: AuthUser; minutes: number }) {
  const { t } = useTranslation();
  const { unlock, signOut } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usesPassword = user.providers.includes('password') || MOCK_MODE;
  const submit = async (event?: SubmitEvent): Promise<void> => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlock(usesPassword && !MOCK_MODE ? password : undefined);
    } catch (e) {
      setError(t(`auth.errors.${e instanceof AuthError ? e.code : 'unknown'}`));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <div className="rounded-card border border-border bg-card p-6 text-card-foreground shadow-card">
        <Icon name="lock" className="size-8 text-muted-foreground" />
        <h1 className="mt-3 text-3xl font-semibold">{t('lock.title')}</h1>
        <p className="mt-2">{t('lock.body', { minutes })}</p>
        <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        <form className="mt-5 space-y-4" onSubmit={(e) => void submit(e)}>
          {usesPassword && !MOCK_MODE ? (
            <TextField
              label={t('lock.password')}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger-subtle-foreground">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" busy={busy}>
            {usesPassword ? t('lock.unlock') : t('lock.google')}
          </Button>
        </form>
        <div className="mt-4">
          <Button variant="ghost" icon="logOut" onClick={() => void signOut({ keepData: true })}>
            {t('auth.signOut')}
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
