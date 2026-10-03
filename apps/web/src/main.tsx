import { Suspense } from 'react';
import { AppLoader } from './App.tsx';
import { loadAuthClient } from './auth/load.ts';
import './i18n/index.ts';
import { mount } from './mount.tsx';
import { captureInstallPrompt } from './portal/install.ts';
import { StartingScreen } from './screens/StateScreens.tsx';
import { applyTheme } from './theme.ts';

applyTheme();
captureInstallPrompt();

mount(
  <Suspense fallback={<StartingScreen />}>
    <AppLoader authClient={loadAuthClient()} />
  </Suspense>,
);
