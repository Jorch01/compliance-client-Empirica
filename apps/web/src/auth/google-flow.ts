/**
 * How Google's sign-in runs on this device (D78). A popup everywhere it
 * works. In the app installed on an iPhone, the popup opens in a separate
 * window that cannot hand the result back (Firebase answers "The requested
 * action is invalid"), so there the sign-in goes to Google and comes back
 * in the app's own window, but only when the helper that finishes it is
 * the portal's own (authDomain is this host): on Firebase's domain the
 * redirect needs third-party storage, which Safari blocks. Otherwise the
 * installed app keeps the popup and its way out to email and password (D70).
 */
import type { Platform } from '../portal/install.ts';

export type GoogleFlow = 'popup' | 'redirect';

export function googleFlow(device: {
  platform: Platform;
  installed: boolean;
  /** The page's host, and where the sign-in finishes. */
  host: string;
  authDomain: string;
}): GoogleFlow {
  return device.installed && device.platform === 'ios' && device.authDomain === device.host
    ? 'redirect'
    : 'popup';
}

/** Set before leaving for Google, so only the page that comes back asks how it went. */
export const REDIRECT_PENDING = 'empirica.googleRedirect';
