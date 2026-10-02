/**
 * Ported from TSJ Filing, test_sync_conflictos.js, cases 1 and 2.
 */
import { describe, expect, it } from 'vitest';
import { CLOCK_KEYS, SyncClock, type ClockStorage } from './clock.ts';

function fakeDevice(start: string) {
  let now = Date.parse(start);
  const data = new Map<string, string>();
  const storage: ClockStorage = { get: (k) => data.get(k) ?? null, set: (k, v) => data.set(k, v) };
  return {
    storage,
    data,
    setTime: (iso: string) => (now = Date.parse(iso)),
    clock: () => new SyncClock(storage, () => now),
  };
}

describe('SyncClock: device clocks that disagree', () => {
  it('learns the offset from the server and stamps with the server time', () => {
    const phone = fakeDevice('2026-08-21T12:00:00.000Z'); // three minutes behind
    const clock = phone.clock();

    expect(clock.stamp().startsWith('2026-08-21T12:00')).toBe(true);
    expect(clock.adjust('2026-08-21T12:03:00.000Z')).toBe(180_000);
    expect(clock.stamp().startsWith('2026-08-21T12:03')).toBe(true);
  });

  it('a later edit on a phone running behind is stamped after the computer edit', () => {
    const phone = fakeDevice('2026-08-21T12:00:00.000Z');
    const clock = phone.clock();
    clock.adjust('2026-08-21T12:03:00.000Z');

    phone.setTime('2026-08-21T12:02:00.000Z'); // real time 12:05
    const phoneStamp = clock.stamp();
    const computerStamp = '2026-08-21T12:04:00.000Z';
    expect(Date.parse(phoneStamp)).toBeGreaterThan(Date.parse(computerStamp));
  });

  it('keeps the offset for the next session', () => {
    const phone = fakeDevice('2026-08-21T12:00:00.000Z');
    phone.clock().adjust('2026-08-21T12:03:00.000Z');
    expect(phone.data.get(CLOCK_KEYS.offset)).toBe('180000');
    expect(phone.clock().offset).toBe(180_000);
  });

  it('does not readjust for ordinary network latency', () => {
    const phone = fakeDevice('2026-08-21T12:00:00.000Z');
    const clock = phone.clock();
    clock.adjust('2026-08-21T12:03:00.000Z');
    phone.setTime('2026-08-21T12:02:00.000Z');
    expect(clock.adjust('2026-08-21T12:05:00.400Z')).toBe(180_000);
  });

  it('ignores a server time it cannot read', () => {
    const clock = fakeDevice('2026-08-21T12:00:00.000Z').clock();
    expect(clock.adjust('not a date')).toBe(0);
  });
});

describe('SyncClock: clocks that jump backwards', () => {
  it('never stamps two consecutive edits in reverse order', () => {
    const device = fakeDevice('2026-08-21T15:00:00.000Z');
    const clock = device.clock();
    const first = clock.stamp();

    device.setTime('2026-08-21T14:30:00.000Z'); // the system moves the time back
    const second = clock.stamp();
    const third = clock.stamp();

    expect(Date.parse(second)).toBeGreaterThan(Date.parse(first));
    expect(Date.parse(third)).toBeGreaterThan(Date.parse(second));
  });

  it('remembers the last stamp across reloads', () => {
    const device = fakeDevice('2026-08-21T15:00:00.000Z');
    const first = device.clock().stamp();
    device.setTime('2026-08-21T14:30:00.000Z');
    const afterReload = device.clock().stamp();
    expect(Date.parse(afterReload)).toBeGreaterThan(Date.parse(first));
  });

  it('keeps working when storage throws (private browsing)', () => {
    const broken: ClockStorage = {
      get: () => {
        throw new Error('blocked');
      },
      set: () => {
        throw new Error('blocked');
      },
    };
    const clock = new SyncClock(broken, () => Date.parse('2026-08-21T15:00:00.000Z'));
    const a = clock.stamp();
    expect(Date.parse(clock.stamp())).toBeGreaterThan(Date.parse(a));
  });
});
