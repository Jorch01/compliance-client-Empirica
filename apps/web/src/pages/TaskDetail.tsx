import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'wouter';
import { ESTADOS_TAREA, text, type AiTextData, type Row } from '@empirica/shared';
import { usePendingIds, useRow } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { taskSemaforo, todayInCancun } from '../domain/deadlines.ts';
import { CLIENT_NEXT, clientSide, stateChange } from '../domain/work.ts';
import { formatDateTime } from '../i18n/index.ts';
import { oneOf, priorityLabel, taskStateLabel } from '../i18n/labels.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader, Spinner } from '../ui/Card.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { SelectField } from '../ui/Field.tsx';
import { Icon } from '../ui/Icon.tsx';
import { aiOn } from './common/ai.ts';
import { Checklist } from './common/Checklist.tsx';
import { Comments } from './common/Comments.tsx';
import { Documents } from './common/Documents.tsx';
import { DueDate, SemaforoBadge } from './common/Semaforo.tsx';
import { InternalMark } from './common/VisibilityField.tsx';
import { TaskForm } from './tasks/TaskForm.tsx';

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** The client's buttons for a task of their side (D18: it ends in review; the firm closes it). */
function ClientMoves({ task }: { task: Row }) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const estado = oneOf(ESTADOS_TAREA, task.estado) ? task.estado : null;
  const next = estado ? CLIENT_NEXT[estado] : undefined;
  if (!next) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {next.map((n) => (
        <Button
          key={n}
          size="sm"
          variant={n === 'EN_REVISION' ? 'primary' : 'secondary'}
          icon={n === 'EN_REVISION' ? 'check' : n === 'BLOQUEADA' ? 'octagon' : 'arrowRight'}
          onClick={() => void engine.mutate('Tareas', 'update', task.id, { estado: n })}
        >
          {n === 'EN_REVISION'
            ? t('tasks.markReady')
            : n === 'BLOQUEADA'
              ? t('tasks.markBlocked')
              : t('tasks.start')}
        </Button>
      ))}
    </div>
  );
}

/**
 * A task: deadline and light, who does it, its checklist, the conversation
 * and its documents. The firm edits everything; a client moves the tasks
 * of their side and ticks their checklist.
 */
export function TaskDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { me, engine, call } = usePortal();
  const [, navigate] = useLocation();
  const names = useNames();
  const task = useRow('Tareas', id);
  const matter = useRow('Asuntos', task ? (text(task, 'asuntoId') ?? undefined) : undefined);
  const blocker = useRow('Tareas', task ? (text(task, 'dependeDe') ?? undefined) : undefined);
  const pending = usePendingIds('Tareas');
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (task === undefined) return <Spinner label={t('common.loading')} />;
  const clientId = task ? text(task, 'clienteId') : null;
  const mayDelete = me.isFirm && can(me, 'Tareas', 'delete', clientId);
  const gone = task === null || Boolean(matter?.deleted) || (Boolean(task.deleted) && !mayDelete);
  const back =
    matter && !matter.deleted ? `/asuntos/${matter.id}` : me.isFirm ? '/tareas' : '/pendientes';
  if (task === null || gone) {
    return (
      <EmptyState
        icon="search"
        title={t('tasks.notFound')}
        action={
          <Link href={back} className={`${buttonClass('primary')} mt-2`}>
            {t('common.back')}
          </Link>
        }
      />
    );
  }

  const deleted = Boolean(task.deleted);
  const estado = oneOf(ESTADOS_TAREA, task.estado) ? task.estado : null;
  const today = todayInCancun();
  const fecha = text(task, 'fechaLimite');
  const firmEdits = me.isFirm && can(me, 'Tareas', 'update', clientId) && !deleted;
  const clientEdits =
    !me.isFirm &&
    can(me, 'Tareas', 'update', clientId) &&
    clientSide(task) &&
    estado !== 'HECHO' &&
    estado !== 'EN_REVISION';
  const mayTick = firmEdits || clientEdits;

  return (
    <>
      <p className="mb-2">
        <Link
          href={back}
          className="inline-flex items-center gap-1 text-sm text-link hover:underline"
        >
          <Icon name="chevronRight" className="size-4 rotate-180" />
          {matter ? text(matter, 'titulo') : t('common.back')}
        </Link>
      </p>
      <PageHeader
        eyebrow={[names.client(clientId), names.unit(text(task, 'entidadId'))]
          .filter(Boolean)
          .join(' · ')}
        title={text(task, 'titulo') ?? ''}
        actions={
          <>
            {firmEdits ? (
              <Button
                variant="secondary"
                icon="pencil"
                onClick={() => {
                  setEditing(true);
                }}
              >
                {t('tasks.edit')}
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
                {t('tasks.deleteTitle')}
              </Button>
            ) : null}
            {mayDelete && deleted ? (
              <Button
                icon="refresh"
                onClick={() => void engine.mutate('Tareas', 'restore', task.id)}
              >
                {t('matters.restore')}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SemaforoBadge light={taskSemaforo(task, today)} />
          {estado ? (
            <span className="text-sm text-muted-foreground">{taskStateLabel(t, estado)}</span>
          ) : null}
          {task.esFatal === true ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-danger-subtle-foreground">
              <Icon name="octagon" className="size-4 text-danger" />
              {t('tasks.fatal')}
            </span>
          ) : null}
          {me.isFirm && task.visibilidad === 'INTERNO' ? <InternalMark /> : null}
        </div>
      </PageHeader>

      {deleted ? (
        <p
          role="status"
          className="mb-4 rounded-control border border-warning-border bg-warning-subtle px-4 py-2 text-warning-subtle-foreground"
        >
          {t('tasks.deleted')}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t('tasks.work')}>
            {text(task, 'descripcion') ? (
              <p className="mb-4 whitespace-pre-line">{text(task, 'descripcion')}</p>
            ) : null}
            <div className="mb-4">
              <Checklist task={task} disabled={!mayTick} />
            </div>
            {firmEdits ? (
              <div className="max-w-xs">
                <SelectField
                  label={t('tasks.changeState')}
                  value={estado ?? ''}
                  onChange={(e) => {
                    const next = ESTADOS_TAREA.find((s) => s === e.target.value);
                    if (next) {
                      void engine.mutate(
                        'Tareas',
                        'update',
                        task.id,
                        stateChange(task, next, new Date().toISOString()),
                      );
                    }
                  }}
                  options={ESTADOS_TAREA.map((s) => ({ value: s, label: taskStateLabel(t, s) }))}
                />
              </div>
            ) : null}
            {clientEdits ? <ClientMoves task={task} /> : null}
            {!me.isFirm && estado === 'EN_REVISION' ? (
              <p className="text-sm text-muted-foreground">{t('tasks.readyHint')}</p>
            ) : null}
            {pending.has(task.id) ? (
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Icon name="cloudOff" className="size-3.5" />
                {t('common.pendingSync')}
              </p>
            ) : null}
          </Card>
          <Comments
            table="Tareas"
            record={task}
            {...(me.isFirm &&
            !deleted &&
            aiOn(me, clientId) &&
            estado !== 'HECHO' &&
            task.ladoResponsable !== 'EMPIRICA' &&
            task.visibilidad === 'COMPARTIDO'
              ? {
                  reminder: async () =>
                    (await call<AiTextData>('ai.reminder', { tareaId: task.id })).data.texto,
                }
              : {})}
          />
        </div>
        <div className="space-y-6">
          <Card title={t('matters.summary')}>
            <dl className="space-y-3">
              <Fact term={t('tasks.deadline')}>
                {fecha ? <DueDate date={fecha} today={today} /> : t('semaforo.noDate')}
              </Fact>
              <Fact term={t('tasks.side')}>
                {oneOf(['EMPIRICA', 'CLIENTE', 'AMBOS'] as const, task.ladoResponsable)
                  ? t(`tasks.lados.${task.ladoResponsable}`)
                  : '—'}
              </Fact>
              <Fact term={t('fields.responsableId')}>
                {names.user(text(task, 'responsableId')) || t('matters.unassigned')}
              </Fact>
              {matter ? (
                <Fact term={t('tasks.matter')}>
                  <Link href={`/asuntos/${matter.id}`} className="text-link hover:underline">
                    {text(matter, 'titulo')}
                  </Link>
                </Fact>
              ) : null}
              {task.prioridad ? (
                <Fact term={t('fields.prioridad')}>{priorityLabel(t, task.prioridad)}</Fact>
              ) : null}
              {blocker && !blocker.deleted ? (
                <Fact term={t('fields.dependeDe')}>
                  <Link href={`/tareas/${blocker.id}`} className="text-link hover:underline">
                    {text(blocker, 'titulo')}
                  </Link>
                  {blocker.estado === 'HECHO' ? ` · ${taskStateLabel(t, 'HECHO')}` : ''}
                </Fact>
              ) : null}
              {task.estado === 'EN_ESPERA_CLIENTE' && text(task, 'enEsperaDesde') ? (
                <Fact term={t('tasks.waitingSince')}>
                  {formatDateTime(text(task, 'enEsperaDesde'))}
                </Fact>
              ) : null}
            </dl>
          </Card>
          <Documents
            table="Tareas"
            record={task}
            defaultArea={matter ? (text(matter, 'area') ?? '') : ''}
          />
        </div>
      </div>

      {editing ? (
        <TaskForm
          task={task}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirm}
        title={t('tasks.deleteTitle')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          setConfirm(false);
          void engine.mutate('Tareas', 'delete', task.id).then(() => {
            navigate(back);
          });
        }}
        onClose={() => {
          setConfirm(false);
        }}
      >
        <p>{t('tasks.deleteBody')}</p>
      </ConfirmDialog>
    </>
  );
}
