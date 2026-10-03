/**
 * One entry point for every POST: parse the envelope, check the app
 * version, authenticate, limit the rate, dispatch. Always answers with the
 * envelope of the contract and the server clock; unexpected errors are
 * logged and reach the client only as INTERNAL, without internals.
 */
import {
  ACTIONS,
  PullPayloadSchema,
  PushPayloadSchema,
  RequestSchema,
  compareVersions,
  toProjectIso,
  type Action,
  type ApiResponse,
} from '@empirica/shared';
import type * as z from 'zod/mini';
import { bootstrap } from './actions/bootstrap.ts';
import { pull } from './actions/pull.ts';
import { push } from './actions/push.ts';
import { authenticate, rateLimit } from './auth.ts';
import { readSettings } from './config.ts';
import { Database } from './db/database.ts';
import type { Env } from './env.ts';
import { ApiError } from './errors.ts';

/** Larger bodies are refused before parsing (a push of 200 ops fits easily). */
export const MAX_BODY_CHARS = 2_000_000;

function parse<T>(schema: z.ZodMiniType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError('VALIDATION', undefined, {
      issues: result.error.issues
        .slice(0, 20)
        .map((i) => ({ path: i.path.join('.'), code: i.code })),
    });
  }
  return result.data;
}

export function handleRequest(env: Env, body: string): ApiResponse<unknown> {
  const serverNow = toProjectIso(env.now());
  let requestId: string | undefined;
  try {
    if (body.length > MAX_BODY_CHARS)
      throw new ApiError('VALIDATION', 'La solicitud es demasiado grande.');
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      throw new ApiError('VALIDATION', 'La solicitud no es JSON válido.');
    }
    const request = parse(RequestSchema, raw);
    requestId = request.requestId;
    if (!(ACTIONS as readonly string[]).includes(request.action))
      throw new ApiError('NOT_IMPLEMENTED');
    const action = request.action as Action;

    if (action === 'ping')
      return { ok: true, data: { pong: true }, serverNow, ...(requestId ? { requestId } : {}) };

    const db = new Database(env);
    const settings = readSettings(db.rows('Config'));
    if (request.appVersion && compareVersions(request.appVersion, settings.minAppVersion) < 0) {
      throw new ApiError('CLIENT_TOO_OLD', undefined, { minAppVersion: settings.minAppVersion });
    }
    const session = authenticate(env, db, request.idToken);
    rateLimit(env, session.user.id, settings.requestsPerMinute);

    let data: unknown;
    switch (action) {
      case 'session.bootstrap':
        data = bootstrap(env, db, session, settings);
        break;
      case 'sync.pull':
        data = pull(env, db, session, parse(PullPayloadSchema, request.payload ?? {}));
        break;
      case 'sync.push':
        data = push(
          env,
          session,
          parse(PushPayloadSchema, request.payload ?? {}),
          request.userAgent ? { userAgent: request.userAgent } : {},
        );
        break;
    }
    return { ok: true, data, serverNow, ...(requestId ? { requestId } : {}) };
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError('INTERNAL');
    if (!(error instanceof ApiError)) {
      env.log('Error inesperado', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } else if (error.code === 'INTERNAL') {
      env.log('Error interno', { message: error.message });
    }
    return {
      ok: false,
      error: {
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details ? { details: apiError.details } : {}),
      },
      serverNow,
      ...(requestId ? { requestId } : {}),
    };
  }
}
