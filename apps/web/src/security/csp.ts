/**
 * What the browser lets the portal's pages load and where they may connect
 * (F7, SEGURIDAD.md § 6). GitHub Pages sends no headers of ours, so each
 * build writes the policy into the page as a <meta> (vite.config.ts).
 *
 * Scripts come only from the portal and from Google's sign-in, never inline
 * or through eval. A <meta> cannot say who may frame the page
 * (frame-ancestors): the portal itself refuses to run inside a frame
 * (framed.ts).
 */

import { FIREBASE_DOMAIN } from '../config/firebase-project.ts';

const SELF = "'self'";

/** The Apps Script Web App answers at script.google.com through a redirect to googleusercontent. */
const APPS_SCRIPT = ['https://script.google.com', 'https://script.googleusercontent.com'];

/**
 * Firebase Auth: its APIs, Google's sign-in helper and, if the project ever
 * asks, reCAPTCHA. The helper is framed from Firebase's domain, or from the
 * portal itself once it serves its own copy (D78, src/config/firebase.ts).
 */
const SIGN_IN = {
  script: ['https://apis.google.com', 'https://www.gstatic.com', 'https://www.google.com'],
  connect: [
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://www.googleapis.com',
  ],
  frame: [SELF, `https://${FIREBASE_DOMAIN}`, 'https://apis.google.com', 'https://www.google.com'],
};

const serialize = (directives: Record<string, readonly string[]>): string =>
  Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(' '))
    .join('; ');

/**
 * The portal. `apiUrl` (VITE_API_URL) adds the backend's origin when it is
 * not Apps Script; a relative one (the mock API) is the portal itself.
 */
export function portalPolicy(apiUrl?: string): string {
  const api = apiUrl?.startsWith('https://') ? [new URL(apiUrl).origin] : [];
  return serialize({
    'default-src': [SELF],
    'script-src': [SELF, ...SIGN_IN.script],
    // Inline styles stay: Google's sign-in sets some, and they cannot run code.
    'style-src': [SELF, "'unsafe-inline'"],
    'img-src': [SELF, 'data:', 'blob:'],
    'font-src': [SELF, 'data:'],
    'connect-src': [SELF, ...APPS_SCRIPT, ...SIGN_IN.connect, ...api],
    'frame-src': SIGN_IN.frame,
    'worker-src': [SELF],
    'manifest-src': [SELF],
    'object-src': ["'none'"],
    'base-uri': [SELF],
    'form-action': [SELF],
  });
}

/** The privacy notice: its text and its own code, nothing else. */
export function privacyPolicy(): string {
  return serialize({
    'default-src': [SELF],
    'style-src': [SELF, "'unsafe-inline'"],
    'img-src': [SELF, 'data:'],
    'font-src': [SELF, 'data:'],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': [SELF],
    'form-action': ["'none'"],
  });
}
