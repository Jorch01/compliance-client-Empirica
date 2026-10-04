import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { obligationState, type PeriodState } from '@empirica/shared';
import { todayInCancun } from '../../domain/deadlines.ts';
import { useScopedRows } from '../../portal/scope.ts';
import { buttonClass } from '../../ui/button-class.ts';
import { Card, EmptyState } from '../../ui/Card.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import type { Tone } from '../../ui/StatusBadge.tsx';
import { useNonWorkingDays } from './compliance.ts';

const SHOWN: readonly { estado: PeriodState; icon: IconName; tone: Tone }[] = [
  { estado: 'vencido', icon: 'alert', tone: 'danger' },
  { estado: 'porVencer', icon: 'clock', tone: 'warning' },
  { estado: 'revision', icon: 'info', tone: 'info' },
];

const TONES: Record<Tone, string> = {
  danger: 'border-danger-border bg-danger-subtle text-danger-subtle-foreground',
  warning: 'border-warning-border bg-warning-subtle text-warning-subtle-foreground',
  info: 'border-info-border bg-info-subtle text-info-subtle-foreground',
  success: 'border-success-border bg-success-subtle text-success-subtle-foreground',
  neutral: 'border-border bg-card text-card-foreground',
};

/**
 * The obligations in view at a glance: how many are overdue, due within a
 * week or waiting for the firm's review, with the way to the matrix.
 */
export function ComplianceSummary() {
  const { t } = useTranslation();
  const obligaciones = useScopedRows('Obligaciones');
  const cumplimientos = useScopedRows('CumplimientosHistorial');
  const inhabiles = useNonWorkingDays();
  const today = todayInCancun();
  const counts = useMemo(() => {
    const out: Partial<Record<string, number>> = {};
    for (const o of obligaciones ?? []) {
      const { estado } = obligationState(o, cumplimientos ?? [], today, inhabiles);
      out[estado] = (out[estado] ?? 0) + 1;
    }
    return out;
  }, [obligaciones, cumplimientos, today, inhabiles]);
  const active = (obligaciones ?? []).filter((o) => o.estado !== 'INACTIVA').length;
  const attention = SHOWN.reduce((sum, s) => sum + (counts[s.estado] ?? 0), 0);

  return (
    <Card
      title={t('dashboard.complianceTitle')}
      actions={
        <Link href="/compliance" className={buttonClass('ghost', 'sm')}>
          {t('dashboard.seeMatrix')}
        </Link>
      }
    >
      {active === 0 ? (
        <EmptyState icon="clipboard" title={t('dashboard.complianceEmpty')} />
      ) : attention === 0 ? (
        <p className="inline-flex items-center gap-2">
          <Icon name="checkCircle" className="size-5 text-success" />
          {t('dashboard.complianceOk')}
        </p>
      ) : (
        <ul className="space-y-2">
          {SHOWN.map(({ estado, icon, tone }) => {
            const n = counts[estado] ?? 0;
            return (
              <li
                key={estado}
                className={`flex items-center gap-2 rounded-control border px-3 py-2 ${TONES[n > 0 ? tone : 'neutral']}`}
              >
                <Icon name={icon} className="size-5" />
                <span className="font-medium">
                  {t(`compliance.counts.${estado}`, { count: n })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
