import { useOptimistic, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import type { Row } from '@empirica/shared';
import { checklistOf, toggledChecklist, type ChecklistItem } from '../../domain/work.ts';
import { usePortal } from '../../session/context.ts';

/**
 * A task's checklist with its marks. A mark shows at once (optimistic) and
 * is saved on the device; only the marks change, never the items (what a
 * client may do).
 */
export function Checklist({ task, disabled }: { task: Row; disabled: boolean }) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const items = checklistOf(task.checklist);
  const [shown, flip] = useOptimistic(items, (state: ChecklistItem[], index: number) =>
    state.map((item, i) => (i === index ? { ...item, hecho: !item.hecho } : item)),
  );
  const [, startTransition] = useTransition();
  if (!shown.length) return null;

  const toggle = (index: number): void => {
    startTransition(async () => {
      flip(index);
      await engine.mutate('Tareas', 'update', task.id, {
        checklist: toggledChecklist(task.checklist, index),
      });
    });
  };

  return (
    <fieldset>
      <legend className="text-sm font-medium">{t('tasks.checklist')}</legend>
      <ul className="mt-2 space-y-1">
        {shown.map((item, i) => (
          <li key={item.id || i}>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={item.hecho}
                disabled={disabled}
                onChange={() => {
                  toggle(i);
                }}
              />
              <span className={item.hecho ? 'text-muted-foreground line-through' : ''}>
                {item.texto}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
