/**
 * The portal's service worker (PLAN.md § 5): the app itself (pages, code,
 * fonts, icons) is kept on the device, so it opens without network and the
 * data comes from IndexedDB. The backend is never cached: its calls are POSTs
 * to another origin, and only the sync engine decides what is stored.
 *
 * A new version waits until the user accepts it (the "new version" notice),
 * so nobody loses what they were typing.
 */
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | PrecacheEntry)[];
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Every address of the app is the same page (the route lives after the #).
// Not Firebase's sign-in helper (/__/auth/, D78): those pages must load as they are.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/\/privacidad\//, /\/mock-api\//, /\/__\//],
  }),
);

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: unknown } | null)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
