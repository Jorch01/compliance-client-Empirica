/**
 * Firebase Auth (Spark, free): email and password, or Google. Only the app
 * and auth modules are loaded, never Firestore.
 *
 * Google opens in a popup. Only the app installed on an iPhone, where the
 * popup cannot hand the result back, goes to Google and comes back in its
 * own window, to sign in or to unlock, and only once the portal serves
 * Firebase's sign-in helper itself (D78, google-flow.ts): on Firebase's
 * domain the redirect needs third-party storage, which Safari blocks
 * (docs/LIMITES.md § 4).
 * Verification and reset emails come back to the portal.
 */
import { initializeApp } from '@firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  linkWithCredential,
  onIdTokenChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
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
import { detectPlatform, isInstalled } from '../portal/install.ts';
import { REDIRECT_PENDING, googleFlow } from './google-flow.ts';
import {
  AuthError,
  type AuthClient,
  type AuthErrorCode,
  type AuthUser,
  type GooglePurpose,
} from './types.ts';

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
  'auth/redirect-cancelled-by-user': 'popup-closed',
  'auth/network-request-failed': 'network',
  'auth/operation-not-allowed': 'not-allowed',
  'auth/requires-recent-login': 'recent-login',
  'auth/provider-already-linked': 'has-password',
  'auth/credential-already-in-use': 'email-in-use',
};

/** Firebase's code stays as the message: an unknown failure shows it (AuthForm). */
function translate(error: unknown): AuthError {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') return new AuthError('unknown');
  return new AuthError(CODES[code] ?? 'unknown', code);
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

/** What the page went to Google for, in sessionStorage where the browser allows it. */
const pending = {
  set: (purpose: GooglePurpose): void => {
    try {
      sessionStorage.setItem(REDIRECT_PENDING, purpose);
    } catch {
      // Without it, the page that comes back just does not ask how it went.
    }
  },
  take: (): GooglePurpose | null => {
    try {
      const was = sessionStorage.getItem(REDIRECT_PENDING);
      sessionStorage.removeItem(REDIRECT_PENDING);
      return was === 'signIn' || was === 'unlock' ? was : null;
    } catch {
      return null;
    }
  },
};

/**
 * How the trip to Google went, on the page that comes back from it. Signed
 * in, the account is already there (Firebase finishes the sign-in as it
 * starts); back without an answer, Google's page was left before the end.
 * Unlocking counts only if Google confirmed it is the same person.
 */
async function redirectOutcome(auth: Auth, purpose: GooglePurpose): Promise<void> {
  let result: Awaited<ReturnType<typeof getRedirectResult>>;
  try {
    result = await getRedirectResult(auth);
  } catch (error) {
    throw translate(error);
  }
  if (!result) throw new AuthError('popup-closed');
  if (purpose === 'unlock' && result.operationType !== 'reauthenticate') {
    throw new AuthError('unknown');
  }
}

/** Popup or a trip to Google in this window (D78), for this device and build. */
const flow = (): ReturnType<typeof googleFlow> =>
  googleFlow({
    platform: detectPlatform(),
    installed: isInstalled(),
    host: location.host,
    authDomain: firebaseConfig.authDomain,
  });

export function createFirebaseAuth(): AuthClient {
  const app = initializeApp(firebaseConfig);
  const auth: Auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // Asked once per page load, so a screen that opens later still hears it.
  const purpose = pending.take();
  const backFromGoogle = purpose ? redirectOutcome(auth, purpose) : null;
  backFromGoogle?.catch(() => undefined);
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
        if (flow() === 'redirect') {
          pending.set('signIn');
          // The page leaves for Google; it comes back signed in (finishGoogleRedirect).
          await signInWithRedirect(auth, provider);
          return;
        }
        await signInWithPopup(auth, provider);
      }),
    finishGoogleRedirect: async (want) => {
      if (!backFromGoogle || purpose !== want) return false;
      await backFromGoogle;
      return true;
    },
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
    addPassword: (password) =>
      run(async () => {
        const user = auth.currentUser;
        if (!user?.email) throw new AuthError('unknown');
        await linkWithCredential(user, EmailAuthProvider.credential(user.email, password));
      }),
    reauthenticate: (password) =>
      run(async () => {
        const user = auth.currentUser;
        if (!user) return;
        if (password !== undefined && user.email) {
          await reauthenticateWithCredential(
            user,
            EmailAuthProvider.credential(user.email, password),
          );
        } else if (flow() === 'redirect') {
          // The lock screen goes to Google; the page comes back unlocked (SessionProvider).
          const provider = new GoogleAuthProvider();
          if (user.email) provider.setCustomParameters({ login_hint: user.email });
          pending.set('unlock');
          await reauthenticateWithRedirect(user, provider);
        } else {
          await reauthenticateWithPopup(user, new GoogleAuthProvider());
        }
      }),
    signOut: () => run(() => signOut(auth)),
  };
}
