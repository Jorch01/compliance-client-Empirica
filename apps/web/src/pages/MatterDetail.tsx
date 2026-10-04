import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'wouter';
import { ESTADOS_ASUNTO, progressOf, text, type Row } from '@empirica/shared';
import { usePendingIds, useRow } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { todayInCancun } from '../domain/deadlines.ts';
import { formatDate } from '../i18n/index.ts';
import { areaLabel, oneOf, priorityLabel } from '../i18n/labels.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader, Spinner } from '../ui/Card.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import { ProgressBar } from '../ui/ProgressBar.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { Comments } from './common/Comments.tsx';
import { Documents } from './common/Documents.tsx';
import { TaskList } from './common/TaskList.tsx';
import { InternalMark } from './common/VisibilityField.tsx';
import { MatterForm } from './matters/MatterForm.tsx';
import {
  MATTER_TONE,
  deleteMatter,
  matterProgressText,
  restoreMatter,
  useMatterTasks,
} from './matters/matters.ts';
import { TaskForm } from './tasks/TaskForm.tsx';

/** One fact of the matter: a term and its value, when it has one. */
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** Open tasks first, by deadline; the done ones after. */
const byWork = (a: Row, b: Row): number =>
  Number(a.estado === 'HECHO') - Number(b.estado === 'HECHO') ||
  (text(a, 'fechaLimite') ?? '9999').localeCompare(text(b, 'fechaLimite') ?? '9999');

/**
 * A matter: what it is, how far along, its tasks, the conversation and its
 * documents. The firm edits, deletes (with its tasks) and restores it; a
 * client reads what is shared and talks with the firm.
 */
export function MatterDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { me, engine } = usePortal();
  const [, navigate] = useLocation();
  const names = useNames();
  const matter = useRow('Asuntos', id);
  const tasksOf = useMatterTasks();
  const pendingTasks = usePendingIds('Tareas');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const tasks = useMemo(() => [...tasksOf(id)].sort(byWork), [tasksOf, id]);
  const today = todayInCancun();

  if (matter === undefined) return <Spinner label={t('common.loading')} />;
  // A deleted matter is gone for whoever cannot bring it back.
  const restorable =
    matter !== null && me.isFirm && can(me, 'Asuntos', 'delete', text(matter, 'clienteId'));
  if (matter === null || (matter.deleted && !restorable)) {
    return (
      <EmptyState
        icon="search"
        title={t('matters.notFound')}
        action={
          <Link href="/asuntos" className={`${buttonClass('primary')} mt-2`}>
            {t('matters.back')}
          </Link>
        }
      />
    );
  }

  const clientId = text(matter, 'clienteId');
  const estado = oneOf(ESTADOS_ASUNTO, matter.estado) ? matter.estado : null;
  const avance = progressOf(tasks);
  const deleted = Boolean(matter.deleted);
  const mayEdit = me.isFirm && can(me, 'Asuntos', 'update', clientId) && !deleted;
  const mayDelete = me.isFirm && can(me, 'Asuntos', 'delete', clientId);
  const mayAddTask = me.isFirm && can(me, 'Tareas', 'create', clientId) && !deleted;
  const dates = [
    text(matter, 'fechaInicio')
      ? `${t('fields.fechaInicio')}: ${formatDate(text(matter, 'fechaInicio'))}`
      : '',
    text(matter, 'fechaObjetivo')
      ? `${t('fields.fechaObjetivo')}: ${formatDate(text(matter, 'fechaObjetivo'))}`
      : '',
  ].filter(Boolean);

  return (
    <>
      <p className="mb-2">
        <Link
          href="/asuntos"
          className="inline-flex items-center gap-1 text-sm text-link hover:underline"
        >
          <Icon name="chevronRight" className="size-4 rotate-180" />
          {t('matters.back')}
        </Link>
      </p>
      <PageHeader
        eyebrow={[names.client(clientId), names.unit(text(matter, 'entidadId'))]
          .filter(Boolean)
          .join(' · ')}
        title={text(matter, 'titulo') ?? ''}
        actions={
          <>
            {mayEdit ? (
              <Button
                variant="secondary"
                icon="pencil"
                onClick={() => {
                  setEditing(true);
                }}
              >
                {t('matters.edit')}
              </Button>
            ) : null}
            {mayDelete && !deleted ? (
              <Button
                variant="ghost"
                icon="trash"
                onClick={() => {
                  setConfirm(true);
                }}
              >
                {t('matters.deleteTitle')}
              </Button>
            ) : null}
            {mayDelete && deleted ? (
              <Button icon="refresh" onClick={() => void restoreMatter(engine, matter)}>
                {t('matters.restore')}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {estado ? (
            <StatusBadge tone={MATTER_TONE[estado]}>{t(`matters.estados.${estado}`)}</StatusBadge>
          ) : null}
          {me.isFirm && matter.visibilidad === 'INTERNO' ? <InternalMark /> : null}
        </div>
      </PageHeader>

      {deleted ? (
        <p
          role="status"
          className="mb-4 rounded-control border border-warning-border bg-warning-subtle px-4 py-2 text-warning-subtle-foreground"
        >
          {t('matters.deleted')}
        </p>
      ) : null}
      {me.isFirm && matter.visibilidad === 'INTERNO' ? (
        <p className="mb-4 rounded-control border border-border bg-muted px-4 py-2 text-sm">
          {t('matters.internalNote')}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title={t('matters.tasksTitle')}
            actions={
              mayAddTask ? (
                <Button
                  size="sm"
                  icon="plus"
                  onClick={() => {
                    setAdding(true);
                  }}
                >
                  {t('tasks.new')}
                </Button>
              ) : undefined
            }
          >
            <TaskList
              tasks={tasks}
              today={today}
              empty={t('matters.tasksEmpty')}
              pending={pendingTasks}
              hideClient
            />
          </Card>
          <Comments table="Asuntos" record={matter} />
        </div>
        <div className="space-y-6">
          <Card title={t('matters.summary')}>
            <dl className="space-y-3">
              <Fact term={t('matters.progress')}>
                {avance === null ? (
                  t('matters.noTasks')
                ) : (
                  <ProgressBar value={avance} text={matterProgressText(t, tasks)} />
                )}
              </Fact>
              <Fact term={t('fields.area')}>{areaLabel(t, matter.area) || '—'}</Fact>
              <Fact term={t('fields.responsableId')}>
                {names.user(text(matter, 'responsableId')) || t('matters.unassigned')}
              </Fact>
              {matter.prioridad ? (
                <Fact term={t('fields.prioridad')}>{priorityLabel(t, matter.prioridad)}</Fact>
              ) : null}
              {dates.length ? <Fact term={t('matters.dates')}>{dates.join(' · ')}</Fact> : null}
              {me.isFirm ? (
                <Fact term={t('fields.dentroIguala')}>
                  {matter.dentroIguala === true ? t('common.yes') : t('common.no')}
                </Fact>
              ) : null}
            </dl>
          </Card>
          <Documents table="Asuntos" record={matter} defaultArea={text(matter, 'area') ?? ''} />
        </div>
      </div>

      {editing ? (
        <MatterForm
          matter={matter}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
      {adding ? (
        <TaskForm
          matter={matter}
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirm}
        title={t('matters.deleteTitle')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          setConfirm(false);
          void deleteMatter(engine, matter).then(() => {
            navigate('/asuntos');
          });
        }}
        onClose={() => {
          setConfirm(false);
        }}
      >
        <p>{t('matters.deleteBody', { count: tasks.length })}</p>
      </ConfirmDialog>
    </>
  );
}
