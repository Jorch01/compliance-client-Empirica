import { Suspense } from 'react';
import { AppLoader } from './App.tsx';
import { loadAuthClient } from './auth/load.ts';
import { captureErrors } from './feedback/diagnostics.ts';
import './i18n/index.ts';
import { mount } from './mount.tsx';
import { captureInstallPrompt } from './portal/install.ts';
import { registerServiceWorker } from './pwa/register.ts';
import { FramedScreen, StartingScreen } from './screens/StateScreens.tsx';
import { isFramed } from './security/framed.ts';
import { applyTheme } from './theme.ts';

applyTheme();
if (!import.meta.env.DEV && isFramed()) {
  // Nothing else starts: no sign-in, no data, no service worker.
  mount(<FramedScreen href={window.location.href} />);
} else {
  captureErrors();
  captureInstallPrompt();
  if (import.meta.env.PROD) registerServiceWorker();
  mount(
    <Suspense fallback={<StartingScreen />}>
      <AppLoader authClient={loadAuthClient()} />
    </Suspense>,
  );
}
