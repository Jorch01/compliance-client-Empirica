/**
 * Who is signed in, as the sign-in provider sees it. Access to the portal
 * is a different question: the backend's whitelist answers it.
 */
export interface AuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  /** 'password' and/or 'google.com'. */
  providers: string[];
}

export const AUTH_ERROR_CODES = [
  'wrong-credentials',
  'email-in-use',
  'weak-password',
  'invalid-email',
  'too-many-requests',
  'popup-blocked',
  'popup-closed',
  'network',
  'not-allowed',
  /** Adding a password asks for a recent sign-in. */
  'recent-login',
  /** The account already has a password. */
  'has-password',
  'unknown',
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthError';
    this.code = code;
  }
}

export interface AuthClient {
  readonly kind: 'firebase' | 'mock';
  /** Calls back now (once known) and on every change of user. */
  subscribe(listener: (user: AuthUser | null) => void): () => void;
  /** A fresh ID token for the backend (renewed when close to expiring). */
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string, name: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  sendVerification(): Promise<void>;
  /** Reads the user again (after they confirm their email in another tab). */
  reload(): Promise<AuthUser | null>;
  resetPassword(email: string): Promise<void>;
  /** Adds a password to an account that signs in with Google (so the email works too). */
  addPassword(password: string): Promise<void>;
  /** Proves again who is at the keyboard (unlocking after inactivity). */
  reauthenticate(password?: string): Promise<void>;
  signOut(): Promise<void>;
}
