import { useTranslation } from 'react-i18next';
import type { HealthIndex } from '@empirica/shared';
import { todayInCancun } from '../../domain/deadlines.ts';
import { Card } from '../../ui/Card.tsx';
import { InfoButton } from '../../ui/InfoButton.tsx';
import { Popover } from '../../ui/Popover.tsx';
import { StatusBadge } from '../../ui/StatusBadge.tsx';
import { useHealthByClient } from './data.ts';
import { BAND_TONE } from './reports.ts';

/** What takes points away, factor by factor (PLAN.md § 8: the breakdown on demand). */
export function HealthBreakdown({ health }: { health: HealthIndex }) {
  const { t } = useTranslation();
  const parts = health.parts.filter((p) => p.count > 0);
  if (!parts.length) return <p className="text-sm text-muted-foreground">{t('health.nothing')}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {parts.map((p) => (
        <li key={p.factor}>
          {t('health.factorLine', {
            factor: t(`health.factors.${p.factor}`),
            count: p.count,
            points: p.points,
          })}
        </li>
      ))}
    </ul>
  );
}

/** A client's health: score and word (never color alone); the breakdown on click or Enter. */
export function HealthBadge({ health, client }: { health: HealthIndex; client: string }) {
  const { t } = useTranslation();
  return (
    <Popover
      align="start"
      className="w-72"
      trigger={(props) => (
        <button type="button" {...props} className="rounded-full">
          <StatusBadge tone={BAND_TONE[health.band]}>
            {`${String(health.score)} · ${t(`health.bands.${health.band}`)}`}
          </StatusBadge>
          <span className="sr-only">{t('health.showBreakdown', { client })}</span>
        </button>
      )}
    >
      {() => (
        <div>
          <p className="label-caps mb-2 text-muted-foreground">{t('health.breakdown')}</p>
          <HealthBreakdown health={health} />
        </div>
      )}
    </Popover>
  );
}

const EMPTY_HEALTH: HealthIndex = { score: 100, band: 'good', parts: [] };

/** A client's health index, with its breakdown and how to read it. */
export function HealthCard({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const health = useHealthByClient(todayInCancun())?.get(clientId) ?? EMPTY_HEALTH;
  return (
    <Card
      title={t('health.titleClient')}
      actions={
        <InfoButton
          content={{
            title: t('health.info.title'),
            purpose: t('health.info.purpose'),
            howToRead: t('health.info.howToRead', { returnObjects: true }),
            example: t('health.info.example'),
          }}
        />
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="font-display text-4xl font-semibold text-heading">{health.score}</span>
        <StatusBadge tone={BAND_TONE[health.band]}>
          {`${t('health.score', { score: health.score })} · ${t(`health.bands.${health.band}`)}`}
        </StatusBadge>
      </div>
      <HealthBreakdown health={health} />
    </Card>
  );
}
