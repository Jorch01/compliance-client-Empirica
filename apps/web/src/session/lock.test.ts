import { describe, expect, it, vi } from 'vitest';
import { AuthError } from '../auth/types.ts';
import { opensLocked } from './lock.ts';

const back = (answer: Promise<boolean>) => ({ finishGoogleRedirect: vi.fn(() => answer) });

describe('the inactivity lock when the session opens (D78)', () => {
  it('stays as it was left', async () => {
    expect(await opensLocked(true, back(Promise.resolve(false)))).toBe(true);
    const client = back(Promise.resolve(true));
    expect(await opensLocked(false, client)).toBe(false);
    // An open session is never unlocked by an old trip to Google.
    expect(client.finishGoogleRedirect).not.toHaveBeenCalled();
  });

  it('opens unlocked on the page that came back from unlocking with Google', async () => {
    const client = back(Promise.resolve(true));
    expect(await opensLocked(true, client)).toBe(false);
    expect(client.finishGoogleRedirect).toHaveBeenCalledWith('unlock');
  });

  it('stays locked if that did not get done', async () => {
    expect(await opensLocked(true, back(Promise.reject(new AuthError('popup-closed'))))).toBe(true);
  });
});
