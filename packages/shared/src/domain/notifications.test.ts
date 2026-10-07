import { describe, expect, it } from 'vitest';
import { isStaleNotice } from './notifications.ts';

const NOW = Date.parse('2026-12-31T12:00:00.000-05:00');
const notice = (createdAt: string, leida: boolean) => ({ id: 'n1', createdAt, leida });

describe('how long a notice stays', () => {
  it('read, 60 days; never read, a year', () => {
    expect(isStaleNotice(notice('2026-11-01T12:00:00.000-05:00', true), NOW)).toBe(false);
    expect(isStaleNotice(notice('2026-11-01T11:59:00.000-05:00', true), NOW)).toBe(true);
    expect(isStaleNotice(notice('2026-03-01T12:00:00.000-05:00', false), NOW)).toBe(false);
    expect(isStaleNotice(notice('2025-12-31T11:59:00.000-05:00', false), NOW)).toBe(true);
  });

  it('keeps one whose date it cannot read', () => {
    expect(isStaleNotice({ id: 'n1', createdAt: '', leida: true }, NOW)).toBe(false);
    expect(isStaleNotice({ id: 'n1', leida: true }, NOW)).toBe(false);
  });
});
