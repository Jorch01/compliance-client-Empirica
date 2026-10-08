import type { AuthClient } from '../auth/types.ts';

/**
 * Whether the session opens locked for inactivity: as it was left, unless
 * this page is the one that came back from unlocking with Google in the app
 * installed on an iPhone (D78). Only when the session opens: a lock that
 * comes later on the same page always asks again. What went wrong on the
 * way is the lock screen's to say.
 */
export async function opensLocked(
  lockedBefore: boolean,
  client: Pick<AuthClient, 'finishGoogleRedirect'>,
): Promise<boolean> {
  if (!lockedBefore) return false;
  const unlocked = await client.finishGoogleRedirect('unlock').catch(() => false);
  return !unlocked;
}
