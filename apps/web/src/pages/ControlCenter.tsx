import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import type { HealthIndex, InvitationsListData, Row } from '@empirica/shared';
import { usePendingIds } from '../data/hooks.ts';
import { groupTasks, isOpenRequest, worstOf } from '../domain/dashboard.ts';
import { todayInCancun } from '../domain/deadlines.ts';
import { clientName, useScope, useScopedRows } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import { InfoButton } from '../ui/InfoButton.tsx';
import { AskPortal } from './common/AskPortal.tsx';
import { RequestList } from './common/RequestList.tsx';
import { SemaforoBadge } from './common/Semaforo.tsx';
import { TaskList } from './common/TaskList.tsx';
import { Tile } from './common/Tile.tsx';
import { Upcoming } from './common/Upcoming.tsx';
import { ComplianceSummary } from './compliance/ComplianceSummary.tsx';
import { useHealthByClient } from './reports/data.ts';
import { HealthBadge, HealthCard } from './reports/HealthBadge.tsx';

type TileKey = 'overdue' | 'dueSoon' | 'inReview' | 'newRequests' | 'waitingClient';

/** Invitations waiting for the firm's approval (online; quietly nothing offline). */
function usePendingApprovals(): number {
  const { call, me } = usePortal();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    call<InvitationsListData>('invitations.list', {})
      .then(({ data }) => {
        if (!cancelled) {
          setCount(data.invitations.filter((i) => i.estado === 'PENDIENTE_APROBACION').length);
        }
      })
      .catch(() => {
        /* offline: the banner simply waits */
      });
    return () => {
      cancelled = true;
    };
  }, [call, me.id]);
  return count;
}

function HealthCell({ health, client }: { health: HealthIndex | undefined; client: string }) {
  return health ? <HealthBadge health={health} client={client} /> : <span>—</span>;
}

function ClientsTable({ tasks, requests }: { tasks: Row[]; requests: Row[] }) {
  const { t } = useTranslation();
  const { clients, setClient } = useScope();
  const today = todayInCancun();
  const health = useHealthByClient(today);
  const rows = useMemo(
    () =>
      clients.map((client) => {
        const groups = groupTasks(
          tasks.filter((x) => x.clienteId === client.id),
          today,
        );
        return {
          client,
          groups,
          light: worstOf(groups),
          requests: requests.filter((r) => r.clienteId === client.id && isOpenRequest(r)).length,
        };
      }),
    [clients, tasks, requests, today],
  );
  if (!clients.length) return <EmptyState icon="building" title={t('dashboard.noClients')} />;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="px-5 py-2 font-medium">
              {t('dashboard.columns.client')}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t('dashboard.columns.status')}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t('health.column')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('dashboard.overdue')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('dashboard.columns.dueSoon')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('dashboard.inReview')}
            </th>
            <th scope="col" className="px-5 py-2 text-right font-medium">
              {t('dashboard.openRequests')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(({ client, groups, light, requests: open }) => (
            <tr key={client.id}>
              <th scope="row" className="px-5 py-3 text-left font-medium">
                <button
                  type="button"
                  className="text-left text-link underline-offset-2 hover:underline"
                  onClick={() => {
                    setClient(client.id);
                  }}
                >
                  {clientName(client)}
                </button>
              </th>
              <td className="px-3 py-3">
                <SemaforoBadge light={light} />
              </td>
              <td className="px-3 py-3">
                <HealthCell health={health?.get(client.id)} client={clientName(client)} />
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{groups.overdue.length}</td>
              <td className="px-3 py-3 text-right tabular-nums">{groups.dueSoon.length}</td>
              <td className="px-3 py-3 text-right tabular-nums">{groups.inReview.length}</td>
              <td className="px-5 py-3 text-right tabular-nums">{open}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The firm's home (Centro de control): what needs attention across the
 * clients, or within the one selected.
 */
export function ControlCenter() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { scope, clients } = useScope();
  const tasks = useScopedRows('Tareas');
  const requests = useScopedRows('Solicitudes');
  const pendingTasks = usePendingIds('Tareas');
  const pendingApprovals = usePendingApprovals();
  const [open, setOpen] = useState<TileKey | null>(null);
  const today = todayInCancun();
  const groups = useMemo(() => groupTasks(tasks ?? [], today), [tasks, today]);
  const fresh = useMemo(() => (requests ?? []).filter((r) => r.estado === 'RECIBIDA'), [requests]);
  const selected = clients.find((c) => c.id === scope.clientId);

  const tiles: {
    key: TileKey;
    tone: 'danger' | 'warning' | 'info' | 'neutral';
    icon: 'alert' | 'clock' | 'info' | 'inbox' | 'user';
    count: number;
  }[] = [
    { key: 'overdue', tone: 'danger', icon: 'alert', count: groups.overdue.length },
    { key: 'dueSoon', tone: 'warning', icon: 'clock', count: groups.dueSoon.length },
    { key: 'inReview', tone: 'info', icon: 'info', count: groups.inReview.length },
    { key: 'newRequests', tone: 'info', icon: 'inbox', count: fresh.length },
    { key: 'waitingClient', tone: 'neutral', icon: 'user', count: groups.clientSide.length },
  ];
  const listOf: Record<Exclude<TileKey, 'newRequests'>, Row[]> = {
    overdue: groups.overdue,
    dueSoon: groups.dueSoon,
    inReview: groups.inReview,
    waitingClient: groups.clientSide,
  };

  return (
    <>
      <PageHeader
        eyebrow={selected ? clientName(selected) : t('dashboard.firmEyebrow')}
        title={t('dashboard.greeting', { name: me.name.split(' ')[0] ?? me.name })}
      />
      {pendingApprovals > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-card border border-info-border bg-info-subtle px-4 py-3 text-info-subtle-foreground">
          <Icon name="mail" className="size-5 text-info" />
          <p className="flex-1 font-medium">
            {t('dashboard.pendingApprovals', { count: pendingApprovals })}
          </p>
          <Link href="/usuarios" className={buttonClass('secondary', 'sm')}>
            {t('dashboard.review')}
          </Link>
        </div>
      ) : null}

      <section aria-labelledby="tiles-title" className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-tour="tiles">
          {tiles.map((tile) => (
            <Tile
              key={tile.key}
              tone={tile.tone}
              icon={tile.icon}
              label={t(`dashboard.${tile.key}`)}
              count={tile.count}
              onClick={() => {
                setOpen(tile.key);
              }}
            />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {scope.clientId ? (
          <Card title={t('dashboard.waitingClient')}>
            <TaskList
              tasks={groups.clientSide}
              today={today}
              empty={t('tasks.pendingEmpty')}
              pending={pendingTasks}
            />
          </Card>
        ) : (
          <Card title={t('dashboard.clientsTitle')}>
            <ClientsTable tasks={tasks ?? []} requests={requests ?? []} />
          </Card>
        )}
        <div className="min-w-0 space-y-6">
          {scope.clientId ? <HealthCard clientId={scope.clientId} /> : null}
          <AskPortal />
          <Upcoming />
          <ComplianceSummary />
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
        {open === 'newRequests' ? (
          <RequestList requests={fresh} />
        ) : open ? (
          <TaskList
            tasks={listOf[open]}
            today={today}
            empty={t('common.noData')}
            pending={pendingTasks}
          />
        ) : null}
      </Dialog>
    </>
  );
}
