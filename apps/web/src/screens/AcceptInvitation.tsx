import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import type { AcceptData } from '@empirica/shared';
import { ApiCallError, callApi } from '../api/client.ts';
import { useAuth } from '../auth/context.ts';
import { useSession } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Spinner } from '../ui/Card.tsx';
import { AuthForm } from './AuthForm.tsx';
import { AuthLayout, MessageScreen } from './AuthLayout.tsx';
import { VerifyEmailScreen } from './StateScreens.tsx';

const REASONS = ['EMAIL_MISMATCH', 'EXPIRED', 'REVOKED', 'INVALID_LINK'] as const;

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
  const [result, setResult] = useState<'idle' | 'accepting' | 'done' | { error: string }>('idle');
  const started = useRef(false);

  const user = auth.status === 'signedIn' ? auth.user : null;
  useEffect(() => {
    if (!user?.emailVerified || started.current) return;
    started.current = true;
    setResult('accepting');
    void (async () => {
      try {
        await callApi<AcceptData>(
          'invitations.accept',
          { token },
          {
            idToken: await client.getIdToken(true),
          },
        );
        setResult('done');
        retry();
      } catch (error) {
        if (error instanceof ApiCallError) {
          const reason = REASONS.find((r) => r === error.reason);
          const email = typeof error.details.email === 'string' ? error.details.email : '';
          setResult({
            error: reason ? t(`invite.errors.${reason}`, { email }) : t(`errors.${error.code}`),
          });
        } else {
          setResult({ error: t('errors.NETWORK') });
        }
      }
    })();
  }, [user?.emailVerified, user, client, token, retry, t]);

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
          <Button variant="secondary" icon="logOut" onClick={() => void client.signOut()}>
            {t('auth.useOtherAccount')}
          </Button>
        }
      >
        <p role="alert">{result.error}</p>
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
