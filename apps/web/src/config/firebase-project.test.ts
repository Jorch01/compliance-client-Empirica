import { describe, expect, it } from 'vitest';
import { FIREBASE_DOMAIN, authDomainFrom } from './firebase-project.ts';

describe('where Google’s sign-in finishes (D78)', () => {
  it('unset, Firebase’s own domain', () => {
    expect(authDomainFrom(undefined)).toBe(FIREBASE_DOMAIN);
    expect(authDomainFrom('')).toBe(FIREBASE_DOMAIN);
    expect(authDomainFrom('   ')).toBe(FIREBASE_DOMAIN);
  });

  it('the portal’s domain as a bare host, however it was pasted', () => {
    expect(authDomainFrom('portal.empirica.mx')).toBe('portal.empirica.mx');
    expect(authDomainFrom(' https://Portal.Empirica.mx/ ')).toBe('portal.empirica.mx');
    expect(authDomainFrom('https://portal.empirica.mx/__/auth/handler')).toBe('portal.empirica.mx');
  });
});
