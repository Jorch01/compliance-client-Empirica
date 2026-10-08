/**
 * Firebase web configuration of the portal (project empirica-portal-d86b4).
 *
 * None of these values is secret: Firebase is built for them to ship to the
 * browser. What protects the project is the restriction of the API key to
 * the portal's domains and to the sign-in APIs (docs/SETUP.md, step 3) and,
 * above all, the whitelist checked by the server on every request.
 *
 * The key stays out of the repository only so that secret scanners do not
 * flag a public repo: it comes from the environment (VITE_FIREBASE_API_KEY
 * locally; the variable FIREBASE_WEB_API_KEY in GitHub Actions).
 *
 * `authDomain` is where Google's sign-in finishes: Firebase's own domain,
 * unless the GitHub variable FIREBASE_AUTH_DOMAIN names the portal's (D78).
 * Then the build carries Firebase's helper pages under /__/auth/
 * (scripts/firebase-auth-helper.ts) and the sign-in never leaves the
 * portal, which the app installed on an iPhone needs (docs/SETUP.md, step 13).
 */
import { FIREBASE_PROJECT, authDomainFrom } from './firebase-project.ts';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  // An unset GitHub variable arrives as an empty string: Firebase's own domain.
  authDomain: authDomainFrom(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  ...FIREBASE_PROJECT,
} as const;
