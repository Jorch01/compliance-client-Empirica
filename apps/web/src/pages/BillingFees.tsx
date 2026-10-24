import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  parseReparto,
  text,
  upcomingPeriods,
  type ESTADOS_HONORARIO,
  type Row,
} from '@empirica/shared';
import { usePendingIds } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { formatDate } from '../i18n/index.ts';
import { useScope } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, Spinner } from '../ui/Card.tsx';
import { Icon } from '../ui/Icon.tsx';
import { StatusBadge, type Tone } from '../ui/StatusBadge.tsx';
import { BillingFrame } from './billing/BillingHeader.tsx';
import { FeeForm } from './billing/FeeForm.tsx';
import { SplitDialog } from './billing/SplitDialog.tsx';
import {
  formatMoney,
  formatPercent,
  useBillingData,
  useParticipantNames,
} from './billing/billing.ts';

type Every = '1' | '2' | '3' | '6' | '12';

const ESTADO_TONE: Record<string, Tone> = {
  ACTIVO: 'success',
  PAUSADO: 'warning',
  TERMINADO: 'neutral',
};

/**
 * "Igualas": each client's fixed fee, how often and from when it is
 * charged, its next charge, what is owed of it today and its split (the
 * partners set it here).
 */
export function BillingFeesPage() {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const data = useBillingData();
  const names = useNames();
  const participant = useParticipantNames();
  const { scope } = useScope();
  const pending = usePendingIds('Honorarios');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [splitting, setSplitting] = useState<Row | null>(null);

  const fees = useMemo(
    () =>
      [...(data?.honorarios ?? [])].sort(
        (a, b) =>
          (a.estado === 'ACTIVO' ? 0 : 1) - (b.estado === 'ACTIVO' ? 0 : 1) ||
          names
            .client(text(a, 'clienteId'))
            .localeCompare(names.client(text(b, 'clienteId')), 'es'),
      ),
    [data, names],
  );

  return (
    <BillingFrame
      tab="fees"
      title={t('billing.fees.title')}
      intro={t('billing.fees.intro')}
      actions={
        <Button
          icon="plus"
          onClick={() => {
            setEditing('new');
          }}
        >
          {t('billing.fees.new')}
        </Button>
      }
    >
      <Card>
        {!data ? (
          <Spinner label={t('common.loading')} />
        ) : fees.length === 0 ? (
          <EmptyState icon="calendar" title={t('billing.fees.empty')} />
        ) : (
          <ul className="divide-y divide-border">
            {fees.map((f) => {
              const next = upcomingPeriods(f, data.today, 1)[0];
              const owed = data.charges
                .filter(
                  (c) => c.honorarioId === f.id && c.status !== 'CANCELADO' && c.saldo > 0.005,
                )
                .reduce((sum, c) => sum + c.saldo, 0);
              const moneda = f.moneda === 'USD' ? 'USD' : 'MXN';
              const every = t(
                `billing.fees.everyOptions.${String(typeof f.cadaMeses === 'number' ? f.cadaMeses : 1) as Every}`,
              );
              const shares = parseReparto(f.reparto);
              const estado = text(f, 'estado') ?? 'ACTIVO';
              return (
                <li key={f.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-4">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="font-medium">{text(f, 'concepto')}</p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        scope.clientId ? '' : names.client(text(f, 'clienteId')),
                        t('billing.fees.perPeriod', {
                          amount: formatMoney(typeof f.monto === 'number' ? f.monto : 0, moneda),
                          every,
                        }),
                        next ? t('billing.fees.next', { date: formatDate(next.fecha) }) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground">{t('billing.fees.split')}: </span>
                      {shares.length
                        ? shares
                            .map(
                              (s) =>
                                `${participant(s.participanteId) ?? '?'} ${formatPercent(s.porcentaje)}`,
                            )
                            .join(' · ')
                        : t('billing.fees.splitNone')}
                    </p>
                    {owed > 0 ? (
                      <p className="mt-1 text-sm">
                        <span className="text-muted-foreground">{t('billing.owed.title')}: </span>
                        <span className="tabular-nums">{formatMoney(owed, moneda)}</span>
                      </p>
                    ) : null}
                    {pending.has(f.id) ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Icon name="cloudOff" className="size-3.5" />
                        {t('common.pendingSync')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={ESTADO_TONE[estado] ?? 'neutral'}>
                      {t(`billing.fees.estados.${estado as (typeof ESTADOS_HONORARIO)[number]}`)}
                    </StatusBadge>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="pencil"
                      onClick={() => {
                        setEditing(f);
                      }}
                    >
                      {t('common.edit')}
                    </Button>
                    {me.isAdmin ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSplitting(f);
                        }}
                      >
                        {t('billing.split.edit')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {editing ? (
        <FeeForm
          {...(editing === 'new' ? {} : { fee: editing })}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      {splitting ? (
        <SplitDialog
          initial={parseReparto(splitting.reparto)}
          canUseFee={false}
          onClose={() => {
            setSplitting(null);
          }}
          onSave={async (reparto) => {
            await engine.mutate('Honorarios', 'update', splitting.id, { reparto });
          }}
        />
      ) : null}
    </BillingFrame>
  );
}
