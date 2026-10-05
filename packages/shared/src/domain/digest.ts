/**
 * What the daily summary tells each person (decision D14): what is overdue,
 * what falls today, what is exactly as many days away as a reminder says
 * (7 and 1 for deadlines; 15, 7, 3 and 1 for fatal ones; a contract by its
 * notice date), and the tasks waiting for the client for a while. Nothing to
 * say, no email.
 */
import { daysUntil, type AgendaItem } from './agenda.ts';
import { parseInstant, toProjectDate } from '../time.ts';
import { text, type Row } from './values.ts';

export interface DigestEntry {
  item: AgendaItem;
  /** Days from today; negative once it passed. */
  days: number;
}

export interface WaitingTask {
  task: Row;
  /** Days it has waited for the client. */
  days: number;
}

export interface Digest {
  overdue: DigestEntry[];
  today: DigestEntry[];
  soon: DigestEntry[];
  waiting: WaitingTask[];
}

/** Picks from `items` (already only what the person may see) what the summary says today. */
export function digestOf(
  items: readonly AgendaItem[],
  today: string,
  waiting: readonly WaitingTask[] = [],
): Digest {
  const digest: Digest = { overdue: [], today: [], soon: [], waiting: [...waiting] };
  for (const item of items) {
    // The other side already did its part: the firm reviews it in the portal.
    if (item.enRevision) continue;
    const days = daysUntil(item, today);
    if (days < 0) {
      // A past appointment is history; a past deadline still open is overdue.
      if (item.tipo === 'VENCIMIENTO') digest.overdue.push({ item, days });
    } else if (days === 0) {
      digest.today.push({ item, days });
    } else if (item.reminders.includes(days)) {
      digest.soon.push({ item, days });
    }
  }
  digest.soon.sort((a, b) => a.days - b.days || a.item.key.localeCompare(b.item.key));
  return digest;
}

export const isEmptyDigest = (d: Digest): boolean =>
  !d.overdue.length && !d.today.length && !d.soon.length && !d.waiting.length;

/**
 * Tasks waiting for the client (`EN_ESPERA_CLIENTE`) that reach a multiple
 * of `everyDays` today: a reminder on day 3, 6, 9… and not every day.
 */
export function waitingOnClient(
  tareas: readonly Row[],
  today: string,
  everyDays: number,
): WaitingTask[] {
  if (!Number.isInteger(everyDays) || everyDays <= 0) return [];
  const out: WaitingTask[] = [];
  for (const task of tareas) {
    if (task.deleted || task.estado !== 'EN_ESPERA_CLIENTE') continue;
    const since = parseInstant(text(task, 'enEsperaDesde') ?? text(task, 'updatedAt'));
    if (since === null) continue;
    const days = daysUntil({ date: today }, toProjectDate(since));
    if (days >= everyDays && days % everyDays === 0) out.push({ task, days });
  }
  return out.sort((a, b) => b.days - a.days || a.task.id.localeCompare(b.task.id));
}
