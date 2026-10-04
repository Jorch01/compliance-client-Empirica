import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import type { AcceptData } from '@empirica/shared';
import { ApiCallError, callApi } from '../api/client.ts';
import { useAuth } from '../auth/context.ts';
import { recordError } from '../feedback/diagnostics.ts';
import { useSession } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Spinner } from '../ui/Card.tsx';
import { AuthForm } from './AuthForm.tsx';
import { AuthLayout, MessageScreen } from './AuthLayout.tsx';
import { VerifyEmailScreen } from './StateScreens.tsx';

const REASONS = ['EMAIL_MISMATCH', 'EXPIRED', 'REVOKED', 'INVALID_LINK'] as const;

interface Failure {
  error: string;
  /** What the browser said, for whoever helps: the step and its message. */
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

/**
 * The link of an invitation (#/invitacion/<secret>): sign in or create the
 * account with the invited email, confirm it, and the invitation is
 * accepted on its own; then the portal opens.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const { t } = useTranslation();
  const { state: auth, client } = useAuth();
  const { retry } = useSession();
  const [, navigate] = useLocation();
  const [result, setResult] = useState<'idle' | 'accepting' | 'done' | Failure>('idle');
  // Each attempt (the first, and every "Reintentar") runs the acceptance once.
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  const user = auth.status === 'signedIn' ? auth.user : null;
  useEffect(() => {
    if (!user?.emailVerified || started.current === attempt) return;
    started.current = attempt;
    setResult('accepting');
    void (async () => {
      // 1. A fresh session token from Firebase (the email may have just been confirmed).
      let idToken: string | null;
      try {
        idToken = await client.getIdToken(true);
      } catch (error) {
        recordError(error, 'invitation: session token');
        setResult({ error: t('invite.errors.TOKEN'), detail: detailOf(error), retry: true });
        return;
      }
      // 2. The portal's server accepts the invitation.
      try {
        await callApi<AcceptData>('invitations.accept', { token }, { idToken });
        setResult('done');
        retry();
      } catch (error) {
        if (error instanceof ApiCallError) {
          const reason = REASONS.find((r) => r === error.reason);
          const email = typeof error.details.email === 'string' ? error.details.email : '';
          setResult({
            error: reason ? t(`invite.errors.${reason}`, { email }) : t(`errors.${error.code}`),
            detail: reason ? null : `${error.code} · ${error.message}`.slice(0, 300),
            retry: !reason,
          });
        } else {
          recordError(error, 'invitation: server');
          setResult({ error: t('errors.NETWORK'), detail: detailOf(error), retry: true });
        }
      }
    })();
  }, [user?.emailVerified, user, client, token, retry, t, attempt]);

  if (auth.status === 'loading') return <Spinner label={t('invite.checking')} />;
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
