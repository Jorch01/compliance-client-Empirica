/**
 * New versions of the portal. The service worker downloads them in the
 * background; the notice asks before switching (nothing typed is lost), and
 * the outdated-app screen switches at once.
 */
import { useSyncExternalStore } from 'react';

let waiting = false;
let apply: (() => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const l of listeners) l();
};

/** Called by the registration (main.tsx): a new version is ready to take over. */
export function newVersionReady(update: () => Promise<void>): void {
  apply = update;
  waiting = true;
  notify();
}

export function setRegistration(value: ServiceWorkerRegistration | undefined): void {
  registration = value;
}

/** "Later": the notice goes away; the new version starts with the next visit. */
export function dismissNewVersion(): void {
  waiting = false;
  notify();
}

export function useNewVersion(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => waiting,
  );
}

/**
 * Switches to the newest version: the one waiting, if any; otherwise asks
 * the server for it first, then reloads.
 */
export async function reloadToNewVersion(): Promise<void> {
  if (apply) {
    await apply();
    return;
  }
  try {
    await registration?.update();
  } catch {
    /* offline: the reload works with what the device has */
  }
  location.reload();
}
