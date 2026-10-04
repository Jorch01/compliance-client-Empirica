import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { text, type Row } from '@empirica/shared';
import { usePendingIds, useRows } from '../data/hooks.ts';
import { groupTasks, isOpenRequest, worstOf } from '../domain/dashboard.ts';
import { todayInCancun } from '../domain/deadlines.ts';
import { rootUnit } from '../domain/scope.ts';
import { roleLabel } from '../i18n/labels.ts';
import { clientName, useScope, useScopedRows } from '../portal/scope.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { InfoButton } from '../ui/InfoButton.tsx';
import { SemaforoBadge } from './common/Semaforo.tsx';
import { TaskList } from './common/TaskList.tsx';
import { Tile } from './common/Tile.tsx';
import { Upcoming } from './common/Upcoming.tsx';
import { ComplianceSummary } from './compliance/ComplianceSummary.tsx';

const HUB = '#hub';
const OTHER = '#other';

/** One row per unit (its branches included), plus what belongs to the company as a whole. */
function UnitsTable({ tasks }: { tasks: Row[] }) {
  const { t } = useTranslation();
  const { entidades, setUnit } = useScope();
  const today = todayInCancun();
  const rows = useMemo(() => {
    const byRoot = new Map<string, Row[]>();
    for (const task of tasks) {
      const unit = text(task, 'entidadId');
      // A task of a unit the user cannot see (assigned to them) goes under "other units".
      const root = !unit
        ? HUB
        : entidades.some((e) => e.id === unit)
          ? rootUnit(unit, entidades)
          : OTHER;
      byRoot.set(root, [...(byRoot.get(root) ?? []), task]);
    }
    const roots = entidades.filter((e) => rootUnit(e.id, entidades) === e.id);
    const list: { id: string; name: string }[] = roots
      .map((unit) => ({ id: unit.id, name: text(unit, 'nombre') ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (byRoot.has(HUB)) list.push({ id: HUB, name: t('dashboard.hubUnit') });
    if (byRoot.has(OTHER)) list.push({ id: OTHER, name: t('dashboard.otherUnits') });
    return list.map((u) => {
      const groups = groupTasks(byRoot.get(u.id) ?? [], today);
      return { ...u, groups, light: worstOf(groups) };
    });
  }, [tasks, entidades, today, t]);

  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="px-5 py-2 font-medium">
              {t('shell.unit')}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t('dashboard.columns.status')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('dashboard.yourSide')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('dashboard.overdue')}
            </th>
            <th scope="col" className="px-5 py-2 text-right font-medium">
              {t('dashboard.columns.dueSoon')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((u) => (
            <tr key={u.id}>
              <th scope="row" className="px-5 py-3 text-left font-medium">
                {u.id !== HUB && u.id !== OTHER ? (
                  <button
                    type="button"
                    className="text-left text-link underline-offset-2 hover:underline"
                    onClick={() => {
                      setUnit(u.id);
                    }}
                  >
                    {u.name}
                  </button>
                ) : (
                  u.name
                )}
              </th>
              <td className="px-3 py-3">
                <SemaforoBadge light={u.light} />
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{u.groups.clientSide.length}</td>
              <td className="px-3 py-3 text-right tabular-nums">{u.groups.overdue.length}</td>
              <td className="px-5 py-3 text-right tabular-nums">{u.groups.dueSoon.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Su Fractional Legal Team": the firm's people the client can see, the responsible lawyer first. */
function TeamCard({ client }: { client: Row | undefined }) {
  const { t } = useTranslation();
  const usuarios = useRows('Usuarios');
  const responsible = client ? text(client, 'abogadoResponsableId') : null;
  const firm = (usuarios ?? [])
    .filter((u) => u.lado === 'EMPIRICA')
    .sort((a, b) =>
      a.id === responsible
        ? -1
        : b.id === responsible
          ? 1
          : (text(a, 'nombre') ?? '').localeCompare(text(b, 'nombre') ?? '', 'es'),
    );
  return (
    <Card
      title={t('team.firm')}
      actions={
        <Link href="/equipo" className={buttonClass('ghost', 'sm')}>
          {t('dashboard.seeAll')}
        </Link>
      }
    >
      {firm.length === 0 ? (
        <EmptyState icon="users" title={t('team.empty')} />
      ) : (
        <ul className="space-y-3">
          {firm.slice(0, 4).map((u) => (
            <li key={u.id} className="flex items-center gap-3">
              <Avatar name={text(u, 'nombre') ?? ''} />
              <div className="min-w-0">
                <p className="font-medium">{text(u, 'nombre')}</p>
                <p className="text-sm text-muted-foreground">
                  {u.id === responsible ? t('team.responsible') : roleLabel(t, u.rolBase)}
                  {text(u, 'email') ? (
                    <>
                      {' · '}
                      <a href={`mailto:${text(u, 'email') ?? ''}`} className="text-link underline">
                        {text(u, 'email')}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type Open = 'overdue' | 'dueSoon' | null;

/**
 * The client's home: what the firm needs from them, what is overdue or due
 * soon, their requests and their team. From the hub, a row per unit.
 */
export function ClientHome() {
  const { t } = useTranslation();
  const { scope, clients, entidades } = useScope();
  const tasks = useScopedRows('Tareas');
  const requests = useScopedRows('Solicitudes');
  const pendingTasks = usePendingIds('Tareas');
  const [open, setOpen] = useState<Open>(null);
  const today = todayInCancun();
  const groups = useMemo(() => groupTasks(tasks ?? [], today), [tasks, today]);
  const client = clients.find((c) => c.id === scope.clientId);
  const unit = entidades.find((e) => e.id === scope.unitId);
  const openRequests = (requests ?? []).filter(isOpenRequest).length;

  if (!client) {
    return <EmptyState icon="building" title={t('shell.noClients')} />;
  }
  return (
    <>
      <PageHeader
        eyebrow={unit ? clientName(client) : t('dashboard.clientEyebrow')}
        title={unit ? (text(unit, 'nombre') ?? '') : clientName(client)}
      />
      <section aria-labelledby="tiles-title" className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="tiles-title" className="sr-only">
            {t('dashboard.info.tiles.title')}
          </h2>
          <InfoButton
            content={{
              title: t('dashboard.info.tiles.title'),
              purpose: t('dashboard.info.tiles.purpose'),
              howToRead: t('dashboard.info.tiles.howToRead', { returnObjects: true }),
              example: t('dashboard.info.tiles.example'),
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            tone="warning"
            icon="list"
            label={t('dashboard.yourSide')}
            count={groups.clientSide.length}
            href="/pendientes"
            data-tour="pending"
          />
          <Tile
            tone="danger"
            icon="alert"
            label={t('dashboard.overdue')}
            count={groups.overdue.length}
            onClick={() => {
              setOpen('overdue');
            }}
          />
          <Tile
            tone="warning"
            icon="clock"
            label={t('dashboard.dueSoon')}
            count={groups.dueSoon.length}
            onClick={() => {
              setOpen('dueSoon');
            }}
          />
          <Tile
            tone="info"
            icon="inbox"
            label={t('dashboard.openRequests')}
            count={openRequests}
            href="/solicitudes"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          {!unit && entidades.length > 0 ? (
            <Card
              title={t('dashboard.unitsTitle')}
              actions={
                <InfoButton
                  content={{
                    title: t('dashboard.info.units.title'),
                    purpose: t('dashboard.info.units.purpose'),
                    howToRead: t('dashboard.info.units.howToRead', {
                      returnObjects: true,
                    }),
                    example: t('dashboard.info.units.example'),
                  }}
                />
              }
            >
              <UnitsTable tasks={tasks ?? []} />
            </Card>
          ) : null}
          <Card
            title={t('tasks.pendingTitle')}
            actions={
              <Link href="/pendientes" className={buttonClass('ghost', 'sm')}>
                {t('dashboard.seeAll')}
              </Link>
            }
          >
            <TaskList
              tasks={groups.clientSide.slice(0, 5)}
              today={today}
              empty={t('tasks.pendingEmpty')}
              pending={pendingTasks}
            />
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          <Upcoming limit={6} />
          <ComplianceSummary />
          <TeamCard client={client} />
        </div>
      </div>

      <Dialog
        open={open !== null}
        onClose={() => {
          setOpen(null);
        }}
        title={open ? t(`dashboard.${open}`) : ''}
        size="lg"
      >
        {open ? <TaskList tasks={groups[open]} today={today} empty={t('common.noData')} /> : null}
      </Dialog>
    </>
  );
}
