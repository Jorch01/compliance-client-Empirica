import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { previousPeriod, text, type FileDownloadData, type Row } from '@empirica/shared';
import { useRows } from '../data/hooks.ts';
import { todayInCancun } from '../domain/deadlines.ts';
import { saveFile } from '../domain/files.ts';
import { apiErrorText } from '../i18n/errors.ts';
import { formatDate } from '../i18n/index.ts';
import { clientName, useScope, useScopedRows } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader, Spinner } from '../ui/Card.tsx';
import { InfoButton } from '../ui/InfoButton.tsx';
import { StatusBadge, type Tone } from '../ui/StatusBadge.tsx';
import { useHealthByClient } from './reports/data.ts';
import { HealthBadge } from './reports/HealthBadge.tsx';
import { periodText, shiftPeriod } from './reports/reports.ts';

type ReportState = 'NONE' | 'BORRADOR' | 'ENVIADO';

const STATE_TONE: Record<ReportState, Tone> = {
  NONE: 'neutral',
  BORRADOR: 'info',
  ENVIADO: 'success',
};

const stateOf = (row: Row | undefined): ReportState =>
  row?.estado === 'ENVIADO' ? 'ENVIADO' : row ? 'BORRADOR' : 'NONE';

/** A sent report's PDF, again (online): the one the client received. */
export function DownloadReport({ reporteId }: { reporteId: string }) {
  const { t } = useTranslation();
  const { call } = usePortal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await call<FileDownloadData>('reports.download', { reporteId });
      saveFile(data.nombre, data.mimeType, data.base64);
    } catch (e) {
      setError(apiErrorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="secondary"
        icon="download"
        busy={busy}
        busyLabel={t('reports.downloading')}
        onClick={() => void download()}
      >
        {t('reports.download')}
      </Button>
      {error ? (
        <span role="alert" className="text-sm text-danger-subtle-foreground">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** The firm: every client's report of a month, its state and the client's health. */
function FirmReports() {
  const { t } = useTranslation();
  const { clients, scope } = useScope();
  const reportes = useRows('Reportes');
  const today = todayInCancun();
  const health = useHealthByClient(today);
  const [periodo, setPeriodo] = useState(() => previousPeriod(today));
  const current = today.slice(0, 7);
  const shown = useMemo(
    () =>
      clients.filter(
        (c) => c.estado !== 'INACTIVO' && (!scope.clientId || c.id === scope.clientId),
      ),
    [clients, scope.clientId],
  );
  const byClient = useMemo(
    () =>
      new Map(
        (reportes ?? [])
          .filter((r) => r.periodo === periodo)
          .map((r) => [text(r, 'clienteId') ?? '', r] as const),
      ),
    [reportes, periodo],
  );

  return (
    <>
      <PageHeader title={t('reports.title')}>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('reports.intro')}</p>
      </PageHeader>
      <Card
        title={t('reports.monthTitle', { period: periodText(periodo) })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <InfoButton
              content={{
                title: t('health.info.title'),
                purpose: t('health.info.purpose'),
                howToRead: t('health.info.howToRead', { returnObjects: true }),
                example: t('health.info.example'),
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              icon="chevronLeft"
              onClick={() => {
                setPeriodo((p) => shiftPeriod(p, -1));
              }}
            >
              {t('reports.prevMonth')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon="chevronRight"
              disabled={periodo >= current}
              onClick={() => {
                setPeriodo((p) => shiftPeriod(p, 1));
              }}
            >
              {t('reports.nextMonth')}
            </Button>
          </div>
        }
      >
        {!shown.length ? (
          <EmptyState icon="building" title={t('reports.noClients')} />
        ) : (
          <div className="relative -mx-5 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-2 font-medium">
                    {t('reports.columns.client')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('reports.columns.state')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('reports.columns.health')}
                  </th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">
                    {t('reports.columns.action')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((client) => {
                  const row = byClient.get(client.id);
                  const state = stateOf(row);
                  const h = health?.get(client.id);
                  return (
                    <tr key={client.id}>
                      <th scope="row" className="px-5 py-3 text-left font-medium">
                        {clientName(client)}
                      </th>
                      <td className="px-3 py-3">
                        <StatusBadge tone={STATE_TONE[state]}>
                          {state === 'ENVIADO' && row
                            ? t('reports.sentOn', { date: formatDate(text(row, 'fecha')) })
                            : t(`reports.states.${state}`)}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        {h ? <HealthBadge health={h} client={clientName(client)} /> : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/reportes/${client.id}/${periodo}`}
                          className={buttonClass(
                            state === 'ENVIADO' ? 'secondary' : 'primary',
                            'sm',
                          )}
                        >
                          {state === 'ENVIADO' ? t('reports.open') : t('reports.prepare')}
                          <span className="sr-only">
                            {`: ${clientName(client)}, ${periodText(periodo)}`}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/** A client: the reports the firm sent, newest first, each with its PDF. */
function ClientReports() {
  const { t } = useTranslation();
  const { access, scope } = useScope();
  const reportes = useScopedRows('Reportes');
  const sent = useMemo(
    () =>
      (reportes ?? [])
        .filter((r) => r.estado === 'ENVIADO')
        .sort((a, b) => (text(b, 'periodo') ?? '').localeCompare(text(a, 'periodo') ?? '')),
    [reportes],
  );
  const header = (
    <PageHeader title={t('reports.title')}>
      <p className="mt-2 max-w-2xl text-muted-foreground">{t('reports.introClient')}</p>
    </PageHeader>
  );
  if (access?.alcance) {
    return (
      <>
        {header}
        <Card>
          <EmptyState icon="file" title={t('reports.unitOnly')} />
        </Card>
      </>
    );
  }
  if (reportes === undefined) return <Spinner label={t('common.loading')} />;
  return (
    <>
      {header}
      <Card>
        {!sent.length ? (
          <EmptyState icon="file" title={t('reports.empty')} />
        ) : (
          <ul className="divide-y divide-border">
            {sent.map((r) => {
              const periodo = text(r, 'periodo') ?? '';
              const clienteId = text(r, 'clienteId') ?? scope.clientId ?? '';
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <Link
                      href={`/reportes/${clienteId}/${periodo}`}
                      className="font-semibold text-link underline-offset-2 hover:underline"
                    >
                      {periodText(periodo)}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {t('reports.sentOn', { date: formatDate(text(r, 'fecha')) })}
                    </p>
                  </div>
                  <DownloadReport reporteId={r.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

/** Reportes (F6): the firm prepares and sends each month's; a client keeps the ones it received. */
export function ReportsPage() {
  const { me } = usePortal();
  return me.isFirm ? <FirmReports /> : <ClientReports />;
}
