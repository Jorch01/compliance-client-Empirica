import { useTranslation } from 'react-i18next';
import { relativeDay } from '../../domain/dashboard.ts';
import { SEMAFORO_TONE, type Semaforo } from '../../domain/deadlines.ts';
import { formatDate } from '../../i18n/index.ts';
import { StatusBadge } from '../../ui/StatusBadge.tsx';

/** The traffic light of a record: icon, color and word, never color alone. */
export function SemaforoBadge({ light }: { light: Semaforo }) {
  const { t } = useTranslation();
  return <StatusBadge tone={SEMAFORO_TONE[light]}>{t(`semaforo.${light}`)}</StatusBadge>;
}

/** "15 oct 2026 · En 12 días". */
export function DueDate({ date, today }: { date: string; today: string }) {
  const { t } = useTranslation();
  const rel = relativeDay(date, today);
  return (
    <span className="whitespace-nowrap">
      <time dateTime={date.slice(0, 10)}>{formatDate(date.slice(0, 10))}</time>
      <span className="text-muted-foreground">
        {' · '}
        {rel.key === 'today' || rel.key === 'tomorrow'
          ? t(`common.${rel.key}`)
          : t(`common.${rel.key}`, { count: rel.count })}
      </span>
    </span>
  );
}
