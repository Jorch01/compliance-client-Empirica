import { describe, expect, it } from 'vitest';
import { googleFlow } from './google-flow.ts';

const PORTAL = 'portal.empirica.mx';
const FIREBASE = 'empirica-portal-d86b4.firebaseapp.com';

describe('how Google’s sign-in runs (D78)', () => {
  it('in the app installed on an iPhone, with the portal’s own helper: there and back in the app', () => {
    expect(googleFlow({ platform: 'ios', installed: true, host: PORTAL, authDomain: PORTAL })).toBe(
      'redirect',
    );
  });

  it('anywhere else, or while the helper is still Firebase’s: the popup', () => {
    // Without the portal's own helper the redirect would need third-party storage.
    expect(
      googleFlow({ platform: 'ios', installed: true, host: PORTAL, authDomain: FIREBASE }),
    ).toBe('popup');
    // Safari, not installed; Android and computers, installed or not.
    expect(
      googleFlow({ platform: 'ios', installed: false, host: PORTAL, authDomain: PORTAL }),
    ).toBe('popup');
    expect(
      googleFlow({ platform: 'android', installed: true, host: PORTAL, authDomain: PORTAL }),
    ).toBe('popup');
    expect(
      googleFlow({ platform: 'desktop', installed: true, host: PORTAL, authDomain: PORTAL }),
    ).toBe('popup');
  });
});
