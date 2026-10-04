/**
 * Recurring obligations (`Obligaciones.recurrencia`): the part of RFC 5545
 * RRULE that the obligation form writes, and nothing more.
 *
 *   FREQ=MONTHLY;INTERVAL=n;BYMONTHDAY=d       every n months, on day d
 *   FREQ=YEARLY;INTERVAL=n;BYMONTH=m;BYMONTHDAY=d   every n years, on m/d
 *
 * `d` is 1 to 28, or -1 for the last day of the month: dates every month has,
 * so the portal and a calendar that reads the same rule (F5) agree. The
 * rule keeps step with an anchor date (the obligation's next due date), so
 * "every 2 months" knows which months. Dates are calendar days in the
 * firm's time zone ("YYYY-MM-DD"), without times.
 *
 * Nothing here knows when an obligation is due by law: the firm writes the
 * rule and the dates (CLAUDE.md, "nada jurídico se inventa").
 */

export type Frequency = 'MONTHLY' | 'YEARLY';

export interface Recurrence {
  freq: Frequency;
  /** Every how many months or years (1 or more). */
  interval: number;
  /** Day of the month, 1 to 28, or -1 for the last day. */
  day: number;
  /** Month (1 to 12), for yearly rules. */
  month?: number;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar parts of "YYYY-MM-DD"; null if it is not one. */
export function dateParts(date: string): { y: number; m: number; d: number } | null {
  const match = DATE.exec(date.slice(0, 10));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function isoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}

/** The date `days` later (or earlier, if negative). */
export function addDays(date: string, days: number): string {
  const p = dateParts(date);
  if (!p) return date;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** "2026-10" → its index in months since year 0, to count steps. */
const monthIndex = (y: number, m: number): number => y * 12 + (m - 1);

const dayIn = (y: number, m: number, day: number): number => (day === -1 ? daysInMonth(y, m) : day);

const validDay = (day: number): boolean =>
  day === -1 || (Number.isInteger(day) && day >= 1 && day <= 28);

/** Reads a rule; null when it is not one the portal writes (then only the next date counts). */
export function parseRecurrence(rule: string | null | undefined): Recurrence | null {
  if (!rule) return null;
  const parts = new Map<string, string>();
  const pieces = rule
    .trim()
    .replace(/^RRULE:/i, '')
    .split(';')
    .filter((piece) => piece.trim());
  for (const piece of pieces) {
    const [key, value] = piece.split('=');
    if (!key || value === undefined) return null;
    parts.set(key.trim().toUpperCase(), value.trim().toUpperCase());
  }
  const freq = parts.get('FREQ');
  if (freq !== 'MONTHLY' && freq !== 'YEARLY') return null;
  const interval = Number(parts.get('INTERVAL') ?? '1');
  const day = Number(parts.get('BYMONTHDAY') ?? 'NaN');
  if (!Number.isInteger(interval) || interval < 1 || interval > 120 || !validDay(day)) return null;
  for (const key of parts.keys()) {
    if (!['FREQ', 'INTERVAL', 'BYMONTHDAY', 'BYMONTH'].includes(key)) return null;
  }
  if (freq === 'MONTHLY') {
    return parts.has('BYMONTH') ? null : { freq, interval, day };
  }
  const month = Number(parts.get('BYMONTH') ?? 'NaN');
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { freq, interval, day, month };
}

/** The rule as it is stored. */
export function formatRecurrence(r: Recurrence): string {
  const interval = r.interval > 1 ? `;INTERVAL=${String(r.interval)}` : '';
  return r.freq === 'MONTHLY'
    ? `FREQ=MONTHLY${interval};BYMONTHDAY=${String(r.day)}`
    : `FREQ=YEARLY${interval};BYMONTH=${String(r.month ?? 1)};BYMONTHDAY=${String(r.day)}`;
}

/** Whether a month is one of the rule's, keeping step with the anchor's month. */
function monthMatches(
  r: Recurrence,
  y: number,
  m: number,
  anchor: { y: number; m: number },
): boolean {
  if (r.freq === 'YEARLY') {
    return m === r.month && (((y - anchor.y) % r.interval) + r.interval) % r.interval === 0;
  }
  const steps = monthIndex(y, m) - monthIndex(anchor.y, anchor.m);
  return ((steps % r.interval) + r.interval) % r.interval === 0;
}

/**
 * The rule's dates from `from` to `to` (both included), in order. The anchor
 * sets the step (which months, which years); it need not be one of them.
 */
export function occurrencesBetween(
  r: Recurrence,
  anchor: string,
  from: string,
  to: string,
): string[] {
  const a = dateParts(anchor);
  const f = dateParts(from);
  const e = dateParts(to);
  if (!a || !f || !e || from > to) return [];
  const out: string[] = [];
  for (let i = monthIndex(f.y, f.m); i <= monthIndex(e.y, e.m); i++) {
    const y = Math.floor(i / 12);
    const m = (i % 12) + 1;
    if (!monthMatches(r, y, m, a)) continue;
    const date = isoDate(y, m, dayIn(y, m, r.day));
    if (date >= from && date <= to) out.push(date);
  }
  return out;
}

/** The first date of the rule after `date` (keeping step with `anchor`). */
export function nextOccurrence(r: Recurrence, anchor: string, date: string): string | null {
  const p = dateParts(date);
  if (!p) return null;
  // Within the next interval (in years for a yearly rule) there is always one.
  const span = r.freq === 'YEARLY' ? r.interval * 12 + 12 : r.interval + 1;
  const end = new Date(Date.UTC(p.y, p.m - 1 + span, 1));
  const to = isoDate(end.getUTCFullYear(), end.getUTCMonth() + 1, 1);
  return occurrencesBetween(r, anchor, addDays(date, 1), to)[0] ?? null;
}

/** Saturday or Sunday. */
export function isWeekend(date: string): boolean {
  const p = dateParts(date);
  if (!p) return false;
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * The due date that holds when the obligation "se recorre" (moves) to the
 * next working day: not a weekend nor a day the firm marked as inhábil.
 */
export function nextWorkingDay(date: string, inhabiles: ReadonlySet<string>): string {
  let d = date;
  for (let i = 0; i < 31 && (isWeekend(d) || inhabiles.has(d)); i++) d = addDays(d, 1);
  return d;
}
