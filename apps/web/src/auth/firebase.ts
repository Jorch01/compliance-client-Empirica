/**
 * Firebase Auth (Spark, free): email and password, or Google. Only the app
 * and auth modules are loaded, never Firestore.
 *
 * Google opens in a popup; if the browser blocks it (or in an app installed
 * on iOS, where popups misbehave) it falls back to a full-page redirect.
 * Verification and reset emails come back to the portal.
 */
import { initializeApp } from '@firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from '@firebase/auth';
import { firebaseConfig } from '../config/firebase.ts';
import { currentLanguage } from '../i18n/index.ts';
import { AuthError, type AuthClient, type AuthErrorCode, type AuthUser } from './types.ts';

const CODES: Record<string, AuthErrorCode> = {
  'auth/invalid-credential': 'wrong-credentials',
  'auth/wrong-password': 'wrong-credentials',
  'auth/user-not-found': 'wrong-credentials',
  'auth/invalid-login-credentials': 'wrong-credentials',
  'auth/email-already-in-use': 'email-in-use',
  'auth/weak-password': 'weak-password',
  'auth/password-does-not-meet-requirements': 'weak-password',
  'auth/invalid-email': 'invalid-email',
  'auth/missing-email': 'invalid-email',
  'auth/too-many-requests': 'too-many-requests',
  'auth/popup-blocked': 'popup-blocked',
  'auth/popup-closed-by-user': 'popup-closed',
  'auth/cancelled-popup-request': 'popup-closed',
  'auth/network-request-failed': 'network',
  'auth/operation-not-allowed': 'not-allowed',
};

function translate(error: unknown): AuthError {
  const code = (error as { code?: unknown } | null)?.code;
  return new AuthError(typeof code === 'string' ? (CODES[code] ?? 'unknown') : 'unknown');
}

const toAuthUser = (user: User | null): AuthUser | null =>
  user
    ? {
        uid: user.uid,
        email: (user.email ?? '').toLowerCase(),
        emailVerified: user.emailVerified,
        name: user.displayName,
        providers: user.providerData.map((p) => p.providerId),
      }
    : null;

/** Where verification and reset links lead back to. */
const continueUrl = (): string => `${location.origin}${import.meta.env.BASE_URL}`;

const installedOnIos = (): boolean =>
  'standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true;

export function createFirebaseAuth(): AuthClient {
  const app = initializeApp(firebaseConfig);
  const auth: Auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // Coming back from a Google redirect: its errors surface on the next attempt.
  getRedirectResult(auth).catch(() => undefined);

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    auth.languageCode = currentLanguage();
    try {
      await fn();
    } catch (error) {
      throw translate(error);
    }
  };

  return {
    kind: 'firebase',
    // Also on token refresh: that is when a confirmed email shows up as verified.
    subscribe: (listener) =>
      onIdTokenChanged(auth, (user) => {
        listener(toAuthUser(user));
      }),
    getIdToken: async (forceRefresh = false) =>
      auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null,
    signInWithPassword: (email, password) =>
      run(() => signInWithEmailAndPassword(auth, email.trim(), password)),
    signUpWithPassword: (email, password, name) =>
      run(async () => {
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(user, { displayName: name.trim() });
        await sendEmailVerification(user, { url: continueUrl() });
      }),
    signInWithGoogle: () =>
      run(async () => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        if (installedOnIos()) {
          await signInWithRedirect(auth, provider);
          return;
        }
        try {
          await signInWithPopup(auth, provider);
        } catch (error) {
          if ((error as { code?: unknown }).code === 'auth/popup-blocked') {
            await signInWithRedirect(auth, provider);
            return;
          }
          throw error;
        }
      }),
    sendVerification: () =>
      run(async () => {
        if (auth.currentUser) await sendEmailVerification(auth.currentUser, { url: continueUrl() });
      }),
    reload: async () => {
      if (!auth.currentUser) return null;
      try {
        await auth.currentUser.reload();
        // A token issued before the confirmation still says "not verified".
        await auth.currentUser.getIdToken(true);
      } catch (error) {
        throw translate(error);
      }
      return toAuthUser(auth.currentUser);
    },
    resetPassword: (email) =>
      run(() => sendPasswordResetEmail(auth, email.trim(), { url: continueUrl() })),
    signOut: () => run(() => signOut(auth)),
  };
}
