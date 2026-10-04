/**
 * Registers the service worker (production builds only; the dev server has
 * none). Checks for a new version every hour while the portal stays open.
 */
import { registerSW } from 'virtual:pwa-register';
import { newVersionReady, setRegistration } from './update.ts';

const HOUR_MS = 3_600_000;

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const update = registerSW({
    onNeedRefresh: () => {
      newVersionReady(() => update(true));
    },
    onRegisteredSW: (_url, registration) => {
      setRegistration(registration);
      if (registration) {
        setInterval(() => {
          if (navigator.onLine) void registration.update().catch(() => undefined);
        }, HOUR_MS);
      }
    },
  });
}
