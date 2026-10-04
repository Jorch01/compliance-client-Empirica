/**
 * The numbers of the home screens, from the local copy: what is overdue,
 * what is due within a week, what waits for review or for the client. Pure
 * functions, the same for the firm's control center and the client's home.
 */
import { text, type Row } from '@empirica/shared';
import { SOON_DAYS, daysBetween, onClientSide, taskSemaforo, type Semaforo } from './deadlines.ts';

/** Requests still being worked on (the rest were turned down or became a matter). */
export const isOpenRequest = (row: Row): boolean =>
  row.estado !== 'RECHAZADA' && row.estado !== 'CONVERTIDA';

export interface TaskGroups {
  overdue: Row[];
  dueSoon: Row[];
  inReview: Row[];
  /** Waiting on the client (their side, not yet sent for review). */
  clientSide: Row[];
}

export function groupTasks(tasks: readonly Row[], today: string): TaskGroups {
  const groups: TaskGroups = { overdue: [], dueSoon: [], inReview: [], clientSide: [] };
  for (const task of tasks) {
    const light = taskSemaforo(task, today);
    if (light === 'overdue') groups.overdue.push(task);
    if (light === 'dueSoon') groups.dueSoon.push(task);
    if (light === 'review') groups.inReview.push(task);
    if (onClientSide(task)) groups.clientSide.push(task);
  }
  const byDate = (a: Row, b: Row): number =>
    (text(a, 'fechaLimite') ?? '9999').localeCompare(text(b, 'fechaLimite') ?? '9999');
  groups.overdue.sort(byDate);
  groups.dueSoon.sort(byDate);
  groups.clientSide.sort(byDate);
  return groups;
}

/** The light of a group of records follows its worst number. */
export function worstOf(groups: Pick<TaskGroups, 'overdue' | 'dueSoon' | 'inReview'>): Semaforo {
  if (groups.overdue.length) return 'overdue';
  if (groups.dueSoon.length) return 'dueSoon';
  if (groups.inReview.length) return 'review';
  return 'onTime';
}

/** "Hoy", "Mañana", "En 3 días", "Hace 2 días": the distance to a date, for the screens. */
export function relativeDay(
  date: string,
  today: string,
): { key: 'today' | 'tomorrow' | 'inDays' | 'daysAgo'; count: number } {
  const days = daysBetween(today, date.slice(0, 10));
  if (days === 0) return { key: 'today', count: 0 };
  if (days === 1) return { key: 'tomorrow', count: 1 };
  return days > 0 ? { key: 'inDays', count: days } : { key: 'daysAgo', count: -days };
}

export { SOON_DAYS };
