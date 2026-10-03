import { useTranslation } from 'react-i18next';
import { text, type Row } from '@empirica/shared';
import { useNames } from '../../data/names.ts';
import { taskSemaforo } from '../../domain/deadlines.ts';
import { useScope } from '../../portal/scope.ts';
import { EmptyState } from '../../ui/Card.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { DueDate, SemaforoBadge } from './Semaforo.tsx';

/** Tasks as a list: light, title, where it belongs and its deadline. */
export function TaskList({
  tasks,
  today,
  empty,
  pending,
}: {
  tasks: readonly Row[];
  today: string;
  empty: string;
  pending?: ReadonlySet<string>;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const { scope } = useScope();
  if (!tasks.length) return <EmptyState icon="checkCircle" title={empty} />;
  return (
    <ul className="divide-y divide-border">
      {tasks.map((task) => {
        const fecha = text(task, 'fechaLimite');
        const where = [
          scope.clientId ? '' : names.client(text(task, 'clienteId')),
          names.unit(text(task, 'entidadId')),
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={task.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
            <SemaforoBadge light={taskSemaforo(task, today)} />
            <div className="min-w-0 flex-1 basis-56">
              <p className="font-medium">
                {text(task, 'titulo')}
                {task.esFatal === true ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-sm font-semibold text-danger-subtle-foreground">
                    <Icon name="octagon" className="size-4 text-danger" />
                    {t('tasks.fatal')}
                  </span>
                ) : null}
              </p>
              {where ? <p className="text-sm text-muted-foreground">{where}</p> : null}
              {pending?.has(task.id) ? (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Icon name="cloudOff" className="size-3.5" />
                  {t('common.pendingSync')}
                </p>
              ) : null}
            </div>
            <div className="text-sm">
              {fecha ? <DueDate date={fecha} today={today} /> : t('semaforo.noDate')}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
