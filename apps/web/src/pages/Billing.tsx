import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import {
  AGING_BUCKETS,
  addDays,
  agingOf,
  earningsOf,
  monthRange,
  monthlySeries,
  nextReminder,
  shiftPeriod,
  text,
  totalsOf,
  type Repeticion,
} from '@empirica/shared';
import { useNames } from '../data/names.ts';
import { formatDate } from '../i18n/index.ts';
import { useScope } from '../portal/scope.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, Spinner } from '../ui/Card.tsx';
import { InfoButton } from '../ui/InfoButton.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { BillingFrame, MoneyTile } from './billing/BillingHeader.tsx';
import { BarList, MonthlyChart } from './billing/Charts.tsx';
import {
  STATUS_TONE,
  chargeLabel,
  formatMoney,
  useBillingData,
  useParticipantNames,
} from './billing/billing.ts';
import { periodText } from './reports/reports.ts';

/** Reminders within this many days show on the dashboard. */
const UPCOMING_DAYS = 30;

/**
 * "Cobranza", the dashboard (F9): a month's earned and collected, what is
 * owed and overdue today, twelve months at a glance, what is owed by age,
 * what each participant took, the charges to collect and the next
 * reminders. Of the client chosen above, or of all of the user's.
 */
export function BillingPage() {
  const { t } = useTranslation();
  const data = useBillingData();
  const names = useNames();
  const participant = useParticipantNames();
  const { scope } = useScope();
  const [periodo, setPeriodo] = useState<string | null>(null);
  const today = data?.today ?? '';
  const month = periodo ?? today.slice(0, 7);

  const view = useMemo(() => {
    if (!data || !month) return null;
    const range = monthRange(month);
    const totals = totalsOf(data.charges, data.pagos, range);
    const horizon = addDays(data.today, UPCOMING_DAYS);
    return {
      totals,
      overdue: data.charges.filter((c) => c.status === 'VENCIDO').length,
      series: monthlySeries(data.charges, data.pagos, month, 'MXN', 12),
      aging: agingOf(data.charges, 'MXN'),
      earnings: earningsOf(
        data.charges,
        { pagos: data.pagos, gastos: data.gastos, participantes: data.participantes },
        range,
        'MXN',
      ),
      owed: data.charges
        .filter((c) => c.status !== 'CANCELADO' && c.saldo > 0.005)
        .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
        .slice(0, 8),
      upcoming: data.recordatorios
        .flatMap((r) => {
          const next = nextReminder(r, data.today);
          return next && next <= horizon ? [{ r, next }] : [];
        })
        .sort((a, b) => a.next.localeCompare(b.next))
        .slice(0, 6),
    };
  }, [data, month]);

  return (
    <BillingFrame tab="board" title={t('billing.title')} intro={t('billing.intro')}>
      {!data || !view ? (
        <Spinner label={t('common.loading')} />
      ) : (
        <div className="space-y-6">
          <Card
            title={t('billing.monthTitle', { period: periodText(month) })}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <InfoButton
                  content={{
                    title: t('billing.info.title'),
                    purpose: t('billing.info.purpose'),
                    howToRead: t('billing.info.howToRead', { returnObjects: true }),
                    example: t('billing.info.example'),
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  icon="chevronLeft"
                  onClick={() => {
                    setPeriodo(shiftPeriod(month, -1));
                  }}
                >
                  {t('billing.prevMonth')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={month >= today.slice(0, 7)}
                  onClick={() => {
                    setPeriodo(shiftPeriod(month, 1));
                  }}
                >
                  {t('billing.nextMonth')}
                </Button>
              </div>
            }
          >
            <p className="mb-4 text-sm text-muted-foreground">
              {scope.clientId ? names.client(scope.clientId) : t('billing.allClients')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MoneyTile
                icon="activity"
                label={t('billing.kpi.devengado')}
                hint={t('billing.kpi.devengadoHint')}
                value={formatMoney(view.totals.MXN.devengado)}
              />
              <MoneyTile
                icon="checkCircle"
                label={t('billing.kpi.cobrado')}
                hint={t('billing.kpi.cobradoHint')}
                value={formatMoney(view.totals.MXN.cobrado)}
              />
              <MoneyTile
                icon="clock"
                label={t('billing.kpi.porCobrar')}
                hint={t('billing.kpi.porCobrarHint')}
                value={formatMoney(view.totals.MXN.porCobrar)}
                href="/cobranza/cobros"
              />
              <MoneyTile
                icon="alert"
                alert={view.totals.MXN.vencido > 0}
                label={t('billing.kpi.vencido')}
                hint={t('billing.kpi.vencidoHint', { count: view.overdue })}
                value={formatMoney(view.totals.MXN.vencido)}
                href="/cobranza/cobros"
              />
            </div>
            {view.totals.USD.devengado || view.totals.USD.cobrado || view.totals.USD.porCobrar ? (
              <p className="mt-4 text-sm">
                {t('billing.kpi.usd', {
                  devengado: formatMoney(view.totals.USD.devengado, 'USD'),
                  cobrado: formatMoney(view.totals.USD.cobrado, 'USD'),
                  porCobrar: formatMoney(view.totals.USD.porCobrar, 'USD'),
                })}
              </p>
            ) : null}
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title={t('billing.chart.title')} className="lg:col-span-2">
              {view.series.some((p) => p.devengado || p.cobrado) ? (
                <MonthlyChart points={view.series} moneda="MXN" />
              ) : (
                <EmptyState icon="activity" title={t('billing.chart.empty')} />
              )}
            </Card>
            <Card title={t('billing.aging.title')}>
              {AGING_BUCKETS.some((b) => view.aging[b] > 0) ? (
                <BarList
                  moneda="MXN"
                  rows={AGING_BUCKETS.map((b) => ({
                    key: b,
                    label: t(`billing.aging.buckets.${b}`),
                    value: view.aging[b],
                  }))}
                />
              ) : (
                <EmptyState icon="checkCircle" title={t('billing.aging.empty')} />
              )}
            </Card>
          </div>

          <Card title={t('billing.earnings.title', { period: periodText(month) })}>
            <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
              {t('billing.earnings.intro')}
            </p>
            {view.earnings.length === 0 ? (
              <EmptyState icon="inbox" title={t('billing.earnings.empty')} />
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <BarList
                  moneda="MXN"
                  rows={view.earnings.map((e) => ({
                    key: e.participanteId ?? 'sin-repartir',
                    label:
                      e.participanteId === null
                        ? t('billing.earnings.unassigned')
                        : (participant(e.participanteId) ?? t('billing.earnings.unknown')),
                    value: Math.max(0, e.neto),
                  }))}
                />
                <div
                  className="relative overflow-x-auto"
                  tabIndex={0}
                  role="region"
                  aria-label={t('billing.earnings.title', { period: periodText(month) })}
                >
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      {t('billing.earnings.title', { period: periodText(month) })}
                    </caption>
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th scope="col" className="py-2 pr-3 font-medium">
                          {t('billing.earnings.who')}
                        </th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">
                          {t('billing.earnings.bruto')}
                        </th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">
                          {t('billing.earnings.impuesto')}
                        </th>
                        <th scope="col" className="py-2 text-right font-medium">
                          {t('billing.earnings.neto')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.earnings.map((e) => (
                        <tr
                          key={e.participanteId ?? 'sin-repartir'}
                          className="border-b border-border last:border-0"
                        >
                          <th scope="row" className="py-2 pr-3 text-left font-normal">
                            {e.participanteId === null
                              ? t('billing.earnings.unassigned')
                              : (participant(e.participanteId) ?? t('billing.earnings.unknown'))}
                          </th>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatMoney(e.bruto)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatMoney(e.impuesto)}
                          </td>
                          <td className="py-2 text-right font-medium tabular-nums">
                            {formatMoney(e.neto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">{t('billing.earnings.estimate')}</p>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card
              title={t('billing.owed.title')}
              actions={
                <Link
                  href="/cobranza/cobros"
                  className="text-sm text-link underline-offset-2 hover:underline"
                >
                  {t('billing.owed.all')}
                </Link>
              }
            >
              {view.owed.length === 0 ? (
                <EmptyState icon="checkCircle" title={t('billing.owed.empty')} />
              ) : (
                <ul className="divide-y divide-border">
                  {view.owed.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-start justify-between gap-2 py-3"
                    >
                      <div className="min-w-0 flex-1 basis-48">
                        <Link
                          href={`/cobranza/cobros/${c.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {chargeLabel(c)}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {[
                            scope.clientId ? '' : names.client(c.clienteId),
                            t('billing.due', { date: formatDate(c.fechaVencimiento) }),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-medium tabular-nums">
                          {formatMoney(c.saldo, c.moneda)}
                        </span>
                        <StatusBadge tone={STATUS_TONE[c.status]}>
                          {c.status === 'VENCIDO'
                            ? t('billing.overdueDays', { count: c.diasVencido })
                            : t(`billing.status.${c.status}`)}
                        </StatusBadge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card
              title={t('billing.upcoming.title')}
              actions={
                <Link
                  href="/cobranza/recordatorios"
                  className="text-sm text-link underline-offset-2 hover:underline"
                >
                  {t('billing.upcoming.all')}
                </Link>
              }
            >
              {view.upcoming.length === 0 ? (
                <EmptyState icon="bell" title={t('billing.upcoming.empty')} />
              ) : (
                <ul className="divide-y divide-border">
                  {view.upcoming.map(({ r, next }) => (
                    <li key={r.id} className="py-3">
                      <p className="font-medium">{text(r, 'titulo')}</p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          formatDate(next),
                          scope.clientId ? '' : names.client(text(r, 'clienteId')),
                          t(
                            `billing.reminders.repeats.${(text(r, 'repetir') ?? 'NO') as Repeticion}`,
                          ),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </BillingFrame>
  );
}
