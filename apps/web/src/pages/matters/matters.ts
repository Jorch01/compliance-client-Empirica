/**
 * What the matter screens share: their tasks as the viewer sees them, the
 * progress in words, the state's tone, and deleting or restoring a matter
 * with its tasks.
 */
import { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { ESTADOS_ASUNTO, text, type Row } from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { useScope } from '../../portal/scope.ts';
import type { SyncEngine } from '../../sync/engine.ts';
import type { Tone } from '../../ui/StatusBadge.tsx';

export const MATTER_TONE: Record<(typeof ESTADOS_ASUNTO)[number], Tone> = {
  ACTIVO: 'info',
  EN_PAUSA: 'warning',
  CONCLUIDO: 'success',
};

/**
 * The live tasks of each matter that this user sees. A client's progress
 * counts only these: it never hints at internal tasks.
 */
export function useMatterTasks(): (asuntoId: string) => Row[] {
  const { scope } = useScope();
  const tasks = useRows('Tareas', scope.clientId);
  const byMatter = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const task of tasks ?? []) {
      const id = text(task, 'asuntoId');
      if (id) map.set(id, [...(map.get(id) ?? []), task]);
    }
    return map;
  }, [tasks]);
  return useCallback((asuntoId: string) => byMatter.get(asuntoId) ?? [], [byMatter]);
}

/** "2 de 3 tareas hechas". */
export function matterProgressText(t: TFunction, tasks: readonly Row[]): string {
  const live = tasks.filter((x) => !x.deleted);
  return t('matters.progressValue', {
    done: live.filter((x) => x.estado === 'HECHO').length,
    total: live.length,
  });
}

/** Tasks deleted within a minute of their matter went away with it. */
const WITH_MATTER_MS = 60_000;

/** Deletes a matter and its live tasks: they go out of sight together. */
export async function deleteMatter(engine: SyncEngine, matter: Row): Promise<void> {
  const tasks = await engine.db.Tareas.where('asuntoId').equals(matter.id).toArray();
  for (const task of tasks) {
    if (!task.deleted) await engine.mutate('Tareas', 'delete', task.id);
  }
  await engine.mutate('Asuntos', 'delete', matter.id);
}

/** Brings a matter back, with the tasks that went away with it. */
export async function restoreMatter(engine: SyncEngine, matter: Row): Promise<void> {
  const when = Date.parse(text(matter, 'deleted') ?? '');
  await engine.mutate('Asuntos', 'restore', matter.id);
  if (!Number.isFinite(when)) return;
  const tasks = await engine.db.Tareas.where('asuntoId').equals(matter.id).toArray();
  for (const task of tasks) {
    const gone = Date.parse(text(task, 'deleted') ?? '');
    if (Number.isFinite(gone) && Math.abs(gone - when) < WITH_MATTER_MS) {
      await engine.mutate('Tareas', 'restore', task.id);
    }
  }
}
