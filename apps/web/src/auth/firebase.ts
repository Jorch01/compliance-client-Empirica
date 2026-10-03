/**
 * Firebase Auth (Spark, free): email and password, or Google. Only the app
 * and auth modules are loaded, never Firestore.
 *
 * Google opens in a popup, never a full-page redirect: the portal is not on
 * Firebase Hosting, and browsers that block third-party storage (Safari,
 * soon Chrome) break the redirect flow there (docs/LIMITES.md § 4).
 * Verification and reset emails come back to the portal.
 */
import { initializeApp } from '@firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  indexedDBLocalPersistence,
  initializeAuth,
  onIdTokenChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
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

/**
 * Where verification and reset links lead back to: the portal, or the
 * invitation the person was accepting, so it finishes on its own.
 */
const continueUrl = (): string =>
  `${location.origin}${import.meta.env.BASE_URL}${location.hash.startsWith('#/invitacion/') ? location.hash : ''}`;

export function createFirebaseAuth(): AuthClient {
  const app = initializeApp(firebaseConfig);
  const auth: Auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
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
        await signInWithPopup(auth, provider);
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
    reauthenticate: (password) =>
      run(async () => {
        const user = auth.currentUser;
        if (!user) return;
        if (password !== undefined && user.email) {
          await reauthenticateWithCredential(
            user,
            EmailAuthProvider.credential(user.email, password),
          );
        } else {
          await reauthenticateWithPopup(user, new GoogleAuthProvider());
        }
      }),
    signOut: () => run(() => signOut(auth)),
  };
}
