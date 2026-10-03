/**
 * Who is calling. Every request carries a Firebase ID token; the server
 * checks it with Identity Toolkit (accounts:lookup), requires a verified
 * email, and then the whitelist: the email must belong to an active user in
 * the Usuarios tab. A Firebase account alone gives no access to anything.
 *
 * The lookup result is cached under the token's SHA-256 (never the token
 * itself) for at most five minutes and never beyond the token's expiry.
 */
import { buildUserContext, text, type Row, type UserContext } from '@empirica/shared';
import type { Database } from './db/database.ts';
import { PROP, type Env } from './env.ts';
import { ApiError } from './errors.ts';

export interface Identity {
  uid: string;
  email: string;
  emailVerified: boolean;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

export interface Session {
  identity: Identity;
  user: Row;
  ctx: UserContext;
}

const LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const MAX_CACHE_SECONDS = 300;
const CLOCK_SKEW_SECONDS = 60;

const unauthenticated = (reason: string): ApiError =>
  new ApiError('UNAUTHENTICATED', undefined, { reason });

interface TokenClaims {
  aud?: unknown;
  iss?: unknown;
  sub?: unknown;
  exp?: unknown;
}

function readClaims(env: Env, token: string): TokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) throw unauthenticated('MALFORMED');
  try {
    return JSON.parse(env.base64UrlDecode(parts[1])) as TokenClaims;
  } catch {
    throw unauthenticated('MALFORMED');
  }
}

export function verifyIdToken(env: Env, token: string | undefined): Identity {
  if (!token) throw unauthenticated('MISSING');
  const projectId = env.prop(PROP.firebaseProjectId);
  const apiKey = env.prop(PROP.firebaseApiKey);
  if (!projectId || !apiKey) {
    throw new ApiError(
      'INTERNAL',
      'El servidor no tiene configurado Firebase (FIREBASE_PROJECT_ID y FIREBASE_SERVER_API_KEY).',
    );
  }

  // Cheap checks first: another project's token or an expired one never
  // reaches Identity Toolkit.
  const claims = readClaims(env, token);
  const nowSeconds = Math.floor(env.now() / 1000);
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) {
    throw unauthenticated('WRONG_PROJECT');
  }
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
    throw unauthenticated('EXPIRED');
  }
  if (typeof claims.sub !== 'string' || !claims.sub) throw unauthenticated('MALFORMED');

  const cacheKey = `tok:${env.sha256Hex(token)}`;
  const cached = env.cacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as Identity;
    } catch {
      /* ignore a damaged entry */
    }
  }

  const response = env.g.UrlFetchApp.fetch(LOOKUP_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: token }),
    headers: { 'x-goog-api-key': apiKey },
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  let body: {
    users?: { localId?: string; email?: string; emailVerified?: boolean; disabled?: boolean }[];
    error?: { message?: string };
  };
  try {
    body = JSON.parse(response.getContentText()) as typeof body;
  } catch {
    body = {};
  }
  if (status === 400) throw unauthenticated(body.error?.message ?? 'INVALID_ID_TOKEN');
  if (status !== 200) {
    env.log('Identity Toolkit respondió con error', { status, message: body.error?.message });
    throw new ApiError(
      'INTERNAL',
      'No se pudo verificar la sesión. Intenta de nuevo en un momento.',
    );
  }
  const user = body.users?.[0];
  if (!user?.localId || user.localId !== claims.sub || user.disabled) {
    throw unauthenticated('USER_NOT_FOUND');
  }
  const identity: Identity = {
    uid: user.localId,
    email: (user.email ?? '').trim().toLowerCase(),
    emailVerified: user.emailVerified === true,
    exp: claims.exp,
  };
  const ttl = Math.min(MAX_CACHE_SECONDS, identity.exp - nowSeconds);
  if (ttl >= 1) env.cachePut(cacheKey, JSON.stringify(identity), ttl);
  return identity;
}

/** The whitelist: an active user with this email in the Usuarios tab. */
export function findUser(db: Database, email: string): Row | undefined {
  const target = email.trim().toLowerCase();
  if (!target) return undefined;
  return db.rows('Usuarios').find((u) => !u.deleted && text(u, 'email')?.toLowerCase() === target);
}

export function authenticate(env: Env, db: Database, token: string | undefined): Session {
  const identity = verifyIdToken(env, token);
  if (!identity.emailVerified) throw new ApiError('EMAIL_NOT_VERIFIED');
  const user = findUser(db, identity.email);
  if (user?.estado !== 'ACTIVO') throw new ApiError('NOT_WHITELISTED');
  const boundUid = text(user, 'firebaseUid');
  // Once bound, a different Firebase account with the same email (deleted and
  // re-created, or taken over) is refused until the firm resets it.
  if (boundUid && boundUid !== identity.uid) throw unauthenticated('ACCOUNT_CHANGED');
  const ctx = buildUserContext({
    user,
    membresias: db.rows('Membresias'),
    entidades: db.rows('Entidades'),
    clientes: db.rows('Clientes'),
  });
  return { identity, user, ctx };
}

/** Requests per user and minute, counted in CacheService (approximate, cheap). */
export function rateLimit(env: Env, userId: string, perMinute: number): void {
  const minute = Math.floor(env.now() / 60_000);
  const key = `rl:${userId}:${minute}`;
  const count = Number(env.cacheGet(key) ?? 0) + 1;
  env.cachePut(key, String(count), 120);
  if (count > perMinute) throw new ApiError('RATE_LIMITED');
}
