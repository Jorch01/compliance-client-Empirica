/**
 * The traffic light of a date (DISENO.md, "semáforo"): the same in every
 * screen, the daily summary and the monthly report. Dates are days in
 * Cancún; a task also reads done or under review before its date.
 */
import { text, type Row } from './values.ts';

export type DateLight = 'overdue' | 'dueSoon' | 'onTime' | 'noDate';
export type Light = DateLight | 'done' | 'review';

/** "Por vencer": due within this many days. */
export const SOON_DAYS = 7;

const DAY_MS = 86_400_000;

/** Days from `from` to `to` ("YYYY-MM-DD", or longer ISO text); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

/** Overdue, due within a week, on time, or no date at all. */
export function dateLight(date: string | null | undefined, today: string): DateLight {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return 'noDate';
  const days = daysBetween(today, date);
  if (days < 0) return 'overdue';
  if (days <= SOON_DAYS) return 'dueSoon';
  return 'onTime';
}

/** A task's light: closed, in review, or by its deadline. */
export function taskLight(task: Row, today: string): Light {
  if (task.estado === 'HECHO') return 'done';
  if (task.estado === 'EN_REVISION') return 'review';
  return dateLight(text(task, 'fechaLimite'), today);
}
