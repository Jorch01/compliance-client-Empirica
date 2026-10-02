/**
 * Dates and times. Instants are stored as ISO 8601 strings with an offset;
 * the project's time zone is America/Cancun, which has had a fixed UTC-5
 * offset with no daylight saving time since February 2015.
 *
 * Never compare two timestamps as strings: "…Z" and "…-05:00" can name the
 * same instant. Parse them with `parseInstant`.
 */

export const PROJECT_TIME_ZONE = 'America/Cancun';
export const PROJECT_UTC_OFFSET_MINUTES = -300;

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Milliseconds since the epoch, or null if the value is not an instant. */
export function parseInstant(value: unknown): number | null {
  if (typeof value !== 'string' || value === '') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** An instant written with the project's offset: 2026-10-02T12:00:00.000-05:00. */
export function toProjectIso(ms: number, offsetMinutes = PROJECT_UTC_OFFSET_MINUTES): string {
  const local = new Date(ms + offsetMinutes * 60_000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return (
    `${pad(local.getUTCFullYear(), 4)}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    `.${pad(local.getUTCMilliseconds(), 3)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** The calendar date (YYYY-MM-DD) of an instant in the project's time zone. */
export function toProjectDate(ms: number): string {
  return toProjectIso(ms).slice(0, 10);
}

/** The later of two instants (either may be missing). */
export function laterOf(a: string | null | undefined, b: string | null | undefined): string | null {
  const ta = parseInstant(a);
  const tb = parseInstant(b);
  if (ta === null) return tb === null ? null : (b ?? null);
  if (tb === null) return a ?? null;
  return tb > ta ? (b ?? null) : (a ?? null);
}
