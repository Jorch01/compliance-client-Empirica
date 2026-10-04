import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { text, type Row } from '@empirica/shared';
import { usePendingIds } from '../data/hooks.ts';
import { can } from '../domain/access.ts';
import { todayInCancun, urgencyOf } from '../domain/deadlines.ts';
import { useScope, useScopedRows } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, PageHeader } from '../ui/Card.tsx';
import { FilterButtons } from '../ui/FilterButtons.tsx';
import { TaskList } from './common/TaskList.tsx';
import { TaskForm } from './tasks/TaskForm.tsx';

type Filter = 'open' | 'mine' | 'waiting' | 'review' | 'overdue' | 'done' | 'all';

const byDeadline = (a: Row, b: Row): number =>
  (text(a, 'fechaLimite') ?? '9999').localeCompare(text(b, 'fechaLimite') ?? '9999');

/** "Tareas" (firm): every task of the clients in view, narrowed by what needs doing. */
export function TasksPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { clients } = useScope();
  const [, navigate] = useLocation();
  const tasks = useScopedRows('Tareas');
  const matters = useScopedRows('Asuntos');
  const pending = usePendingIds('Tareas');
  const [filter, setFilter] = useState<Filter>('open');
  const [creating, setCreating] = useState(false);
  const today = todayInCancun();
  const canCreate = clients.some((c) => can(me, 'Tareas', 'create', c.id));

  const shown = useMemo(() => {
    // A deleted matter takes its tasks out of sight.
    const live = new Set((matters ?? []).map((m) => m.id));
    return (tasks ?? [])
      .filter((x) => !text(x, 'asuntoId') || live.has(text(x, 'asuntoId') ?? ''))
      .filter((x) => {
        const open = x.estado !== 'HECHO';
        switch (filter) {
          case 'open':
            return open;
          case 'mine':
            return open && x.responsableId === me.id;
          case 'waiting':
            return x.estado === 'EN_ESPERA_CLIENTE';
          case 'review':
            return x.estado === 'EN_REVISION';
          case 'overdue':
            return open && urgencyOf(text(x, 'fechaLimite'), today) === 'overdue';
          case 'done':
            return !open;
          default:
            return true;
        }
      })
      .sort(byDeadline);
  }, [tasks, matters, filter, me.id, today]);

  return (
    <>
      <PageHeader
        title={t('tasks.title')}
        actions={
          canCreate ? (
            <Button
              icon="plus"
              onClick={() => {
                setCreating(true);
              }}
            >
              {t('tasks.new')}
            </Button>
          ) : undefined
        }
      >
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('tasks.intro')}</p>
      </PageHeader>
      <Card>
        <div className="mb-3">
          <FilterButtons
            label={t('matters.filterLabel')}
            value={filter}
            onChange={setFilter}
            options={(['open', 'mine', 'waiting', 'review', 'overdue', 'done', 'all'] as const).map(
              (f) => ({ value: f, label: t(`tasks.filters.${f}`) }),
            )}
          />
        </div>
        <TaskList tasks={shown} today={today} empty={t('tasks.empty')} pending={pending} />
      </Card>
      {creating ? (
        <TaskForm
          onClose={() => {
            setCreating(false);
          }}
          onSaved={(id) => {
            navigate(`/tareas/${id}`);
          }}
        />
      ) : null}
    </>
  );
}
