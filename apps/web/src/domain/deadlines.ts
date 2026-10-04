/**
 * Dates as the firm reads them: in America/Cancun (UTC-5 all year), by day.
 * The traffic light of a deadline comes from here, for every screen.
 */
import { text, type Row } from '@empirica/shared';
import type { Tone } from '../ui/StatusBadge.tsx';

const DAY_MS = 86_400_000;

/** "2026-10-03": today in Cancún. */
export function todayInCancun(now: number = Date.now()): string {
  return new Date(now - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** Days from `from` to `to` (both "YYYY-MM-DD"); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export type Urgency = 'overdue' | 'dueSoon' | 'onTime' | 'none';

export const SOON_DAYS = 7;

export function urgencyOf(date: string | null | undefined, today: string): Urgency {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return 'none';
  const days = daysBetween(today, date.slice(0, 10));
  if (days < 0) return 'overdue';
  if (days <= SOON_DAYS) return 'dueSoon';
  return 'onTime';
}

export type Semaforo = 'overdue' | 'dueSoon' | 'onTime' | 'done' | 'review' | 'noDate';

export const SEMAFORO_TONE: Record<Semaforo, Tone> = {
  overdue: 'danger',
  dueSoon: 'warning',
  onTime: 'success',
  done: 'success',
  review: 'info',
  noDate: 'neutral',
};

/** A task's light: closed, in review, or by its deadline. */
export function taskSemaforo(task: Row, today: string): Semaforo {
  if (task.estado === 'HECHO') return 'done';
  if (task.estado === 'EN_REVISION') return 'review';
  const u = urgencyOf(text(task, 'fechaLimite'), today);
  return u === 'none' ? 'noDate' : u;
}

/** Tasks waiting on the client (decision D18: they finish at EN_REVISION). */
export function onClientSide(task: Row): boolean {
  return (
    (task.ladoResponsable === 'CLIENTE' || task.ladoResponsable === 'AMBOS') &&
    task.estado !== 'HECHO' &&
    task.estado !== 'EN_REVISION'
  );
}

/** Open: not done. */
export const isOpenTask = (task: Row): boolean => task.estado !== 'HECHO';

export interface Deadline {
  table: 'Tareas' | 'Obligaciones' | 'Tramites' | 'Contratos';
  row: Row;
  date: string;
  label: string;
  clienteId: string | null;
  entidadId: string | null;
}

/** States after which a date no longer counts. */
const CLOSED = new Set(['HECHO', 'CONCLUIDO', 'CANCELADO', 'INACTIVA']);

/** The dated things of a set of rows, soonest first, within `days` from today (overdue included). */
export function upcoming(
  sources: { table: Deadline['table']; rows: readonly Row[]; field: string; label: string }[],
  today: string,
  days: number,
): Deadline[] {
  const out: Deadline[] = [];
  for (const s of sources) {
    for (const row of s.rows) {
      if (row.deleted || CLOSED.has(text(row, 'estado') ?? '')) continue;
      const date = text(row, s.field);
      if (!date) continue;
      if (daysBetween(today, date.slice(0, 10)) > days) continue;
      out.push({
        table: s.table,
        row,
        date: date.slice(0, 10),
        label: text(row, s.label) ?? '',
        clienteId: text(row, 'clienteId'),
        entidadId: text(row, 'entidadId'),
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
