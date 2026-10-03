import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { text, type EstadoTarea, type Row, type Value } from '@empirica/shared';
import { usePendingIds, useRows } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { onClientSide, taskSemaforo, todayInCancun } from '../domain/deadlines.ts';
import { taskStateLabel } from '../i18n/labels.ts';
import { useScope, useScopedRows } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { Icon } from '../ui/Icon.tsx';
import { DueDate, SemaforoBadge } from './common/Semaforo.tsx';

interface ChecklistItem {
  id: string;
  texto: string;
  hecho: boolean;
}

function checklistOf(value: Value | undefined): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? [
          {
            id: typeof item.id === 'string' ? item.id : '',
            texto: typeof item.texto === 'string' ? item.texto : '',
            hecho: item.hecho === true,
          },
        ]
      : [],
  );
}

/** Where a client may take a task of their side (decision D18: the firm closes it). */
const NEXT: Partial<Record<EstadoTarea, EstadoTarea[]>> = {
  POR_HACER: ['EN_CURSO', 'EN_REVISION', 'BLOQUEADA'],
  EN_ESPERA_CLIENTE: ['EN_CURSO', 'EN_REVISION', 'BLOQUEADA'],
  EN_CURSO: ['EN_REVISION', 'BLOQUEADA'],
  BLOQUEADA: ['EN_CURSO', 'EN_REVISION'],
};

function TaskCard({ task, editable, pending }: { task: Row; editable: boolean; pending: boolean }) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const names = useNames();
  const asuntos = useRows('Asuntos', text(task, 'clienteId'));
  const today = todayInCancun();
  const estado = text(task, 'estado') as EstadoTarea | null;
  const checklist = checklistOf(task.checklist);
  const matter = asuntos?.find((a) => a.id === task.asuntoId);
  const fecha = text(task, 'fechaLimite');

  const move = (next: EstadoTarea): void => {
    void engine.mutate('Tareas', 'update', task.id, { estado: next });
  };
  const toggle = (index: number): void => {
    const next = checklist.map((item, i) => (i === index ? { ...item, hecho: !item.hecho } : item));
    // Only the marks change: same items, same text, same order (the server checks it).
    const original = Array.isArray(task.checklist) ? task.checklist : [];
    const merged = original.map((raw, i) =>
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? { ...raw, hecho: next[i]?.hecho ?? false }
        : raw,
    );
    void engine.mutate('Tareas', 'update', task.id, { checklist: merged });
  };

  return (
    <li className="rounded-card border border-border bg-card p-4 shadow-subtle">
      <div className="flex flex-wrap items-start gap-3">
        <SemaforoBadge light={taskSemaforo(task, today)} />
        <div className="min-w-0 flex-1 basis-60">
          <h3 className="font-sans text-base font-semibold text-foreground">
            {text(task, 'titulo')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {[
              matter ? `${t('tasks.matter')}: ${text(matter, 'titulo') ?? ''}` : '',
              names.unit(text(task, 'entidadId')),
              estado ? taskStateLabel(t, estado) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="text-sm">
          {fecha ? (
            <>
              <span className="sr-only">{t('tasks.deadline')}: </span>
              <DueDate date={fecha} today={today} />
            </>
          ) : null}
          {task.esFatal === true ? (
            <p className="mt-1 flex items-center gap-1 font-semibold text-danger-subtle-foreground">
              <Icon name="octagon" className="size-4 text-danger" />
              {t('tasks.fatal')}
            </p>
          ) : null}
        </div>
      </div>
      {text(task, 'descripcion') ? (
        <p className="mt-3 text-sm whitespace-pre-line">{text(task, 'descripcion')}</p>
      ) : null}
      {checklist.length > 0 ? (
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">{t('tasks.checklist')}</legend>
          <ul className="mt-1 space-y-1">
            {checklist.map((item, i) => (
              <li key={item.id || i}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={item.hecho}
                    disabled={!editable || estado === 'EN_REVISION'}
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
      ) : null}
      {pending ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Icon name="cloudOff" className="size-3.5" />
          {t('common.pendingSync')}
        </p>
      ) : null}
      {editable && estado && NEXT[estado] ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {NEXT[estado].map((next) => (
            <Button
              key={next}
              size="sm"
              variant={next === 'EN_REVISION' ? 'primary' : 'secondary'}
              icon={
                next === 'EN_REVISION' ? 'check' : next === 'BLOQUEADA' ? 'octagon' : 'arrowRight'
              }
              onClick={() => {
                move(next);
              }}
            >
              {next === 'EN_REVISION'
                ? t('tasks.markReady')
                : next === 'BLOQUEADA'
                  ? t('tasks.markBlocked')
                  : t('tasks.start')}
            </Button>
          ))}
        </div>
      ) : null}
      {estado === 'EN_REVISION' ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('tasks.readyHint')}</p>
      ) : null}
    </li>
  );
}

/**
 * "Pendientes de su lado": what the firm needs from the client. They mark
 * progress and send it for review, offline too; the firm closes it.
 */
export function PendingPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { scope } = useScope();
  const tasks = useScopedRows('Tareas');
  const pending = usePendingIds('Tareas');
  const editable = can(me, 'Tareas', 'update', scope.clientId);

  const { mine, review } = useMemo(() => {
    const list = tasks ?? [];
    const byDate = (a: Row, b: Row): number =>
      (text(a, 'fechaLimite') ?? '9999').localeCompare(text(b, 'fechaLimite') ?? '9999');
    return {
      mine: list.filter(onClientSide).sort(byDate),
      review: list
        .filter(
          (x) =>
            x.estado === 'EN_REVISION' &&
            (x.ladoResponsable === 'CLIENTE' || x.ladoResponsable === 'AMBOS'),
        )
        .sort(byDate),
    };
  }, [tasks]);

  return (
    <>
      <PageHeader title={t('tasks.pendingTitle')} />
      {!editable ? (
        <p className="mb-4 rounded-control border border-border bg-muted px-4 py-2 text-sm">
          {t('tasks.readOnly')}
        </p>
      ) : null}
      {mine.length === 0 ? (
        <Card>
          <EmptyState icon="checkCircle" title={t('tasks.pendingEmpty')} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {mine.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              editable={editable}
              pending={pending.has(task.id)}
            />
          ))}
        </ul>
      )}
      {review.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-2xl font-semibold">{t('tasks.inReviewTitle')}</h2>
          <ul className="space-y-3">
            {review.map((task) => (
              <TaskCard key={task.id} task={task} editable={false} pending={pending.has(task.id)} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
