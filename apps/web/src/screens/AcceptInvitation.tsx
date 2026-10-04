import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import type { AcceptData } from '@empirica/shared';
import { ApiCallError, NetworkError } from '../api/client.ts';
import { useAuth } from '../auth/context.ts';
import { recordError } from '../feedback/diagnostics.ts';
import { makeCaller } from '../session/caller.ts';
import { useSession } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Spinner } from '../ui/Card.tsx';
import { AuthForm } from './AuthForm.tsx';
import { AuthLayout, MessageScreen } from './AuthLayout.tsx';
import { VerifyEmailScreen } from './StateScreens.tsx';

const REASONS = ['EMAIL_MISMATCH', 'EXPIRED', 'REVOKED', 'INVALID_LINK'] as const;

interface Failure {
  error: string;
  /** What the browser or the server said, for whoever helps. */
  detail: string | null;
  /** Worth trying again (the network or the session, not the invitation). */
  retry: boolean;
}

/** "auth/network-request-failed" or "TypeError: Failed to fetch": the cause, short. */
function detailOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return (typeof code === 'string' ? `${code} · ${message}` : message).slice(0, 300);
}

/** The invitation itself said no, the server could not be read, or the session could not be had. */
function failureOf(t: TFunction, error: unknown): Failure {
  if (error instanceof ApiCallError) {
    const reason = REASONS.find((r) => r === error.reason);
    const email = typeof error.details.email === 'string' ? error.details.email : '';
    return reason
      ? { error: t(`invite.errors.${reason}`, { email }), detail: null, retry: false }
      : {
          error: t(`errors.${error.code}`),
          detail: `${error.code} · ${error.message}`.slice(0, 300),
          retry: true,
        };
  }
  recordError(error, 'invitation');
  return {
    error: error instanceof NetworkError ? t('invite.errors.NETWORK') : t('invite.errors.TOKEN'),
    detail: detailOf(error),
    retry: true,
  };
}

/**
 * Accepts the invitation for the account signed in now: once, and again
 * with "Reintentar". It lives only while that account is signed in, so
 * signing out and in again, with it or another one, starts over.
 */
function Acceptance({ token }: { token: string }) {
  const { t } = useTranslation();
  const { client } = useAuth();
  const { retry } = useSession();
  const [, navigate] = useLocation();
  const [result, setResult] = useState<'accepting' | 'done' | Failure>('accepting');
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    void (async () => {
      try {
        // With the session's token, renewed once if the server finds it expired.
        await makeCaller(client)<AcceptData>('invitations.accept', { token });
        setResult('done');
        retry();
      } catch (error) {
        setResult(failureOf(t, error));
      }
    })();
  }, [attempt, client, token, retry, t]);

  if (typeof result === 'object') {
    return (
      <MessageScreen
        title={t('invite.title')}
        actions={
          <>
            {result.retry ? (
              <Button
                icon="refresh"
                onClick={() => {
                  setResult('accepting');
                  setAttempt((n) => n + 1);
                }}
              >
                {t('invite.retry')}
              </Button>
            ) : null}
            <Button variant="secondary" icon="logOut" onClick={() => void client.signOut()}>
              {t('auth.useOtherAccount')}
            </Button>
          </>
        }
      >
        <p role="alert">{result.error}</p>
        {result.detail ? (
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer">{t('invite.details')}</summary>
            <p className="mt-1 font-mono break-words">{result.detail}</p>
          </details>
        ) : null}
      </MessageScreen>
    );
  }
  if (result === 'done') {
    return (
      <MessageScreen
        title={t('invite.accepted')}
        actions={
          <Button
            icon="arrowRight"
            onClick={() => {
              navigate('/');
            }}
          >
            {t('invite.goToPortal')}
          </Button>
        }
      >
        <p>{t('invite.title')}</p>
      </MessageScreen>
    );
  }
  return (
    <AuthLayout>
      <Spinner label={t('invite.accepting')} />
    </AuthLayout>
  );
}

/**
 * The link of an invitation (#/invitacion/<secret>): sign in or create the
 * account with the invited email, confirm it, and the invitation is
 * accepted on its own; then the portal opens.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const { t } = useTranslation();
  const { state: auth } = useAuth();

  if (auth.status === 'loading') return <Spinner label={t('invite.checking')} />;
  const user = auth.status === 'signedIn' ? auth.user : null;
  if (!user) {
    return (
      <AuthLayout>
        <div className="mb-4 rounded-card border border-accent-strong bg-accent p-4 text-accent-foreground">
          <p className="font-semibold">{t('invite.title')}</p>
          <p className="mt-1 text-sm">{t('invite.intro')}</p>
        </div>
        <AuthForm initialMode="signUp" />
      </AuthLayout>
    );
  }
  if (!user.emailVerified) return <VerifyEmailScreen user={user} />;
  // Signing out unmounts it and another account replaces it: no answer meant for an earlier sign-in stays.
  return <Acceptance key={user.uid} token={token} />;
}
