import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateParts,
  formatRecurrence,
  isWeekend,
  nextOccurrence,
  nextWorkingDay,
  occurrencesBetween,
  parseRecurrence,
} from './recurrence.ts';

describe('reading a rule', () => {
  it('takes the monthly and yearly rules the form writes', () => {
    expect(parseRecurrence('FREQ=MONTHLY;BYMONTHDAY=12')).toEqual({
      freq: 'MONTHLY',
      interval: 1,
      day: 12,
    });
    expect(parseRecurrence('RRULE:FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=-1;')).toEqual({
      freq: 'MONTHLY',
      interval: 2,
      day: -1,
    });
    expect(parseRecurrence('freq=yearly;bymonth=3;bymonthday=12')).toEqual({
      freq: 'YEARLY',
      interval: 1,
      day: 12,
      month: 3,
    });
  });

  it('refuses what it would not compute right, so only the next date counts', () => {
    for (const rule of [
      '',
      null,
      'FREQ=WEEKLY;BYDAY=MO',
      'FREQ=MONTHLY',
      'FREQ=MONTHLY;BYMONTHDAY=31',
      'FREQ=MONTHLY;BYMONTHDAY=0',
      'FREQ=MONTHLY;BYMONTHDAY=12;BYMONTH=3',
      'FREQ=YEARLY;BYMONTHDAY=12',
      'FREQ=YEARLY;BYMONTH=13;BYMONTHDAY=1',
      'FREQ=MONTHLY;INTERVAL=0;BYMONTHDAY=1',
      'FREQ=MONTHLY;BYMONTHDAY=1;COUNT=3',
      'FREQ=MONTHLY;BYMONTHDAY',
    ]) {
      expect(parseRecurrence(rule)).toBeNull();
    }
  });

  it('writes back what it reads', () => {
    for (const rule of [
      'FREQ=MONTHLY;BYMONTHDAY=12',
      'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1',
      'FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=-1',
      'FREQ=YEARLY;INTERVAL=2;BYMONTH=3;BYMONTHDAY=12',
    ]) {
      const parsed = parseRecurrence(rule);
      expect(parsed && formatRecurrence(parsed)).toBe(rule);
    }
  });
});

describe('dates', () => {
  it('checks calendar dates', () => {
    expect(dateParts('2026-02-29')).toBeNull();
    expect(dateParts('2028-02-29')).toEqual({ y: 2028, m: 2, d: 29 });
    expect(dateParts('2026-13-01')).toBeNull();
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lists a monthly rule, the last day of each month included', () => {
    const r = parseRecurrence('FREQ=MONTHLY;BYMONTHDAY=-1');
    if (!r) throw new Error('rule');
    expect(occurrencesBetween(r, '2026-01-31', '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('keeps step with the anchor when the rule skips months or years', () => {
    const every2 = parseRecurrence('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=12');
    const yearly2 = parseRecurrence('FREQ=YEARLY;INTERVAL=2;BYMONTH=3;BYMONTHDAY=12');
    if (!every2 || !yearly2) throw new Error('rule');
    expect(occurrencesBetween(every2, '2026-09-12', '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-12',
      '2026-03-12',
      '2026-05-12',
      '2026-07-12',
      '2026-09-12',
      '2026-11-12',
    ]);
    expect(occurrencesBetween(yearly2, '2027-03-12', '2026-01-01', '2031-12-31')).toEqual([
      '2027-03-12',
      '2029-03-12',
      '2031-03-12',
    ]);
    expect(nextOccurrence(every2, '2026-09-12', '2026-09-12')).toBe('2026-11-12');
    expect(nextOccurrence(yearly2, '2027-03-12', '2027-03-12')).toBe('2029-03-12');
    expect(nextOccurrence(every2, '2026-09-12', '2026-12-31')).toBe('2027-01-12');
  });

  it('moves a due date past weekends and the firm’s non-working days', () => {
    expect(isWeekend('2026-10-31')).toBe(true);
    expect(isWeekend('2026-11-02')).toBe(false);
    expect(nextWorkingDay('2026-10-31', new Set())).toBe('2026-11-02');
    expect(nextWorkingDay('2026-10-31', new Set(['2026-11-02']))).toBe('2026-11-03');
    expect(nextWorkingDay('2026-11-16', new Set(['2026-11-16']))).toBe('2026-11-17');
    expect(nextWorkingDay('2026-11-17', new Set())).toBe('2026-11-17');
  });
});
