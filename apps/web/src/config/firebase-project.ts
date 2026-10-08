/**
 * The portal's Firebase project (empirica-portal-d86b4): the values that do
 * not depend on the build. Plain constants, so the CI script that copies
 * Firebase's sign-in helper (scripts/firebase-auth-helper.ts) reads the
 * same ones as the browser.
 */
export const FIREBASE_PROJECT = {
  projectId: 'empirica-portal-d86b4',
  storageBucket: 'empirica-portal-d86b4.firebasestorage.app',
  messagingSenderId: '89313263530',
  appId: '1:89313263530:web:c999dbc329272a9f5df5d3',
} as const;

/** Firebase's own domain for the project: where its sign-in helper lives by default. */
export const FIREBASE_DOMAIN = `${FIREBASE_PROJECT.projectId}.firebaseapp.com`;

/**
 * Where Google's sign-in finishes, from the GitHub variable
 * FIREBASE_AUTH_DOMAIN (D78): a bare host, as Firebase wants it, even if it
 * was pasted with "https://" or a path; unset, Firebase's own domain.
 */
export function authDomainFrom(value: string | undefined): string {
  const host = (value ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
  return host.length > 0 ? host : FIREBASE_DOMAIN;
}
