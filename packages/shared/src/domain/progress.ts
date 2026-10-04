/**
 * A matter's progress: the share of its tasks that are done. The server
 * keeps it in `Asuntos.avance` counting every task; a client's screen counts
 * the tasks it sees, so it never hints at internal ones.
 */
import type { Row } from './values.ts';

/** 0 to 100, or null for a matter without tasks. */
export function progressOf(tasks: readonly Row[]): number | null {
  const live = tasks.filter((t) => !t.deleted);
  if (!live.length) return null;
  const done = live.filter((t) => t.estado === 'HECHO').length;
  return Math.round((done / live.length) * 100);
}
