import { Suspense, lazy, use } from 'react';
import { Router, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { AuthProvider } from './auth/AuthProvider.tsx';
import type { AuthClient } from './auth/types.ts';
import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';
import { AcceptInvitation } from './screens/AcceptInvitation.tsx';
import {
  FailedScreen,
  LockScreen,
  LoginScreen,
  NeedsNetworkScreen,
  NoAccessScreen,
  OutdatedScreen,
  ReauthScreen,
  StartingScreen,
  VerifyEmailScreen,
} from './screens/StateScreens.tsx';
import { configNumber, useSession } from './session/context.ts';
import { SessionProvider } from './session/SessionProvider.tsx';

/** The signed-in portal is a download of its own: the sign-in does not wait for it. */
const Portal = lazy(() => import('./portal/Portal.tsx').then((m) => ({ default: m.Portal })));

/** The link of an invitation: #/invitacion/<64 hex>. */
const INVITATION = /^\/invitacion\/([0-9a-f]{64})\/?$/;

/** What to show for the state of the session; the portal only when it is ready. */
function Root() {
  const { state } = useSession();
  const [location] = useLocation();
  const invitation = INVITATION.exec(location)?.[1];
  if (invitation) return <AcceptInvitation token={invitation} />;
  switch (state.status) {
    case 'starting':
      return <StartingScreen />;
    case 'signedOut':
      return <LoginScreen />;
    case 'unverified':
      return <VerifyEmailScreen user={state.authUser} />;
    case 'noAccess':
      return <NoAccessScreen user={state.authUser} reason={state.reason} />;
    case 'reauth':
      return <ReauthScreen days={state.days} />;
    case 'needsNetwork':
      return <NeedsNetworkScreen />;
    case 'outdated':
      return <OutdatedScreen />;
    case 'failed':
      return <FailedScreen message={state.message} />;
    case 'ready':
      return state.locked ? (
        <LockScreen
          user={state.authUser}
          minutes={configNumber(state.me, 'inactividadMinutos', 30)}
        />
      ) : (
        <Suspense fallback={<StartingScreen />}>
          <Portal />
        </Suspense>
      );
  }
}

/**
 * The portal: who signs in (Firebase, or the demo accounts of the mock
 * mode), the session on this device, and the screens. Addresses live after
 * the `#` so GitHub Pages serves every one of them from the same page.
 */
export function App({ authClient }: { authClient: AuthClient }) {
  return (
    <AuthProvider client={authClient}>
      <SessionProvider>
        <Router hook={useHashLocation}>
          <Root />
        </Router>
        <UpdatePrompt />
      </SessionProvider>
    </AuthProvider>
  );
}

/** The portal once its sign-in provider has loaded (Firebase is a separate download). */
export function AppLoader({ authClient }: { authClient: Promise<AuthClient> }) {
  return <App authClient={use(authClient)} />;
}
