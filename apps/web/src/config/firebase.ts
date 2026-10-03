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
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: 'empirica-portal-d86b4.firebaseapp.com',
  projectId: 'empirica-portal-d86b4',
  storageBucket: 'empirica-portal-d86b4.firebasestorage.app',
  messagingSenderId: '89313263530',
  appId: '1:89313263530:web:c999dbc329272a9f5df5d3',
} as const;
