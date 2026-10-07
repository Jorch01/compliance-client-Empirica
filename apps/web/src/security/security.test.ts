/**
 * F7: what the browser lets the portal load (src/security/csp.ts) and the
 * portal's refusal to run inside another page. The built pages carry the
 * policy, and the browser tests run under it (e2e/fixtures.ts).
 */
import { describe, expect, it } from 'vitest';
import { firebaseConfig } from '../config/firebase.ts';
import { portalPolicy, privacyPolicy } from './csp.ts';
import { isFramed } from './framed.ts';

const directives = (policy: string): Map<string, string[]> =>
  new Map(
    policy.split('; ').map((directive) => {
      const [name = '', ...sources] = directive.split(' ');
      return [name, sources];
    }),
  );

describe('the security policy of the portal', () => {
  const portal = directives(portalPolicy());

  it('runs scripts only from the portal and Google’s sign-in: never inline, never eval', () => {
    expect(portal.get('script-src')).toEqual([
      "'self'",
      'https://apis.google.com',
      'https://www.gstatic.com',
      'https://www.google.com',
    ]);
    expect(portalPolicy()).not.toMatch(/unsafe-eval/);
    expect(portal.get('script-src')).not.toContain("'unsafe-inline'");
    expect(portal.get('object-src')).toEqual(["'none'"]);
    expect(portal.get('base-uri')).toEqual(["'self'"]);
  });

  it('lets in the sign-in helper of the portal’s own Firebase project', () => {
    expect(portal.get('frame-src')).toContain(`https://${firebaseConfig.authDomain}`);
    expect(portal.get('connect-src')).toEqual(
      expect.arrayContaining([
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
      ]),
    );
  });

  it('connects to the backend: Apps Script, or the address the build was given', () => {
    expect(portal.get('connect-src')).toEqual(
      expect.arrayContaining(['https://script.google.com', 'https://script.googleusercontent.com']),
    );
    expect(
      directives(portalPolicy('https://api.example.com/exec?x=1')).get('connect-src'),
    ).toContain('https://api.example.com');
    // The mock API is the portal itself.
    expect(directives(portalPolicy('/mock-api/exec')).get('connect-src')).toEqual(
      portal.get('connect-src'),
    );
  });

  it('the privacy notice loads only itself: no Google, no frames, no forms', () => {
    const privacy = directives(privacyPolicy());
    expect(privacyPolicy()).not.toMatch(/google/);
    expect(privacy.get('frame-src')).toEqual(["'none'"]);
    expect(privacy.get('form-action')).toEqual(["'none'"]);
    expect(privacy.get('default-src')).toEqual(["'self'"]);
  });
});

describe('inside another page', () => {
  it('knows when it is framed, even by a page it cannot look at', () => {
    const self = {};
    expect(isFramed({ top: self, self })).toBe(false);
    expect(isFramed({ top: {}, self })).toBe(true);
    const crossOrigin = {
      get top(): unknown {
        throw new DOMException('Blocked a frame with origin', 'SecurityError');
      },
      self,
    };
    expect(isFramed(crossOrigin)).toBe(true);
  });
});
