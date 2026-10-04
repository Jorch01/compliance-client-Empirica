import { ApiCallError, callApi } from '../api/client.ts';
import type { AuthClient } from '../auth/types.ts';
import type { Caller } from '../sync/engine.ts';

/**
 * Calls the backend with the user's ID token. A token refused as expired is
 * renewed once and the call repeated (PLAN.md § 3: the token is renewed
 * before the queue is sent).
 */
export function makeCaller(auth: AuthClient): Caller {
  return async (action, payload) => {
    const token = await auth.getIdToken();
    try {
      return await callApi(action, payload, { idToken: token });
    } catch (error) {
      if (
        error instanceof ApiCallError &&
        error.code === 'UNAUTHENTICATED' &&
        error.reason !== 'ACCOUNT_CHANGED'
      ) {
        return callApi(action, payload, { idToken: await auth.getIdToken(true) });
      }
      throw error;
    }
  };
}
