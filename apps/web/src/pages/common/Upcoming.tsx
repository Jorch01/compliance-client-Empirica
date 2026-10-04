import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import {
  currentPeriod,
  filingDate,
  isOpenFiling,
  nextKeyDate,
  text,
  type Period,
} from '@empirica/shared';
import { useNames } from '../../data/names.ts';
import { DEADLINE_PATH, todayInCancun, upcoming, type Semaforo } from '../../domain/deadlines.ts';
import { useScope, useScopedRows } from '../../portal/scope.ts';
import { Card, EmptyState } from '../../ui/Card.tsx';
import { useNonWorkingDays } from '../compliance/compliance.ts';
import { DueDate, SemaforoBadge } from './Semaforo.tsx';

const DAYS = 30;

const PERIOD_LIGHT: Record<Period['estado'], Semaforo> = {
  cumplido: 'done',
  revision: 'review',
  vencido: 'overdue',
  porVencer: 'dueSoon',
  pendiente: 'onTime',
};

/**
 * Everything with a date in the next 30 days (and what is already overdue):
 * tasks, the obligations' open periods, filings and the contracts' key
 * dates, soonest first. Each one opens its page.
 */
export function Upcoming({ limit = 8 }: { limit?: number }) {
  const { t } = useTranslation();
  const names = useNames();
  const { scope } = useScope();
  const tareas = useScopedRows('Tareas');
  const obligaciones = useScopedRows('Obligaciones');
  const cumplimientos = useScopedRows('CumplimientosHistorial');
  const tramites = useScopedRows('Tramites');
  const contratos = useScopedRows('Contratos');
  const inhabiles = useNonWorkingDays();
  const today = todayInCancun();
  const items = useMemo(() => {
    const periods = new Map(
      (obligaciones ?? []).map((o) => [
        o.id,
        currentPeriod(o, cumplimientos ?? [], today, inhabiles),
      ]),
    );
    return upcoming(
      [
        { table: 'Tareas', rows: tareas ?? [], field: 'fechaLimite', label: 'titulo' },
        {
          table: 'Obligaciones',
          rows: obligaciones ?? [],
          label: 'nombre',
          dateOf: (o) => periods.get(o.id)?.vence ?? null,
          lightOf: (o) => {
            const p = periods.get(o.id);
            return p ? PERIOD_LIGHT[p.estado] : null;
          },
        },
        {
          table: 'Tramites',
          rows: tramites ?? [],
          label: 'titulo',
          dateOf: (f) => (isOpenFiling(f) ? filingDate(f) : null),
        },
        {
          table: 'Contratos',
          rows: contratos ?? [],
          label: 'contraparte',
          dateOf: (c) => nextKeyDate(c, today)?.date ?? null,
          kindOf: (c) => {
            const key = nextKeyDate(c, today);
            return key ? t(`dashboard.keyDates.${key.kind}`) : null;
          },
        },
      ],
      today,
      DAYS,
    );
  }, [tareas, obligaciones, cumplimientos, tramites, contratos, inhabiles, today, t]);

  return (
    <Card title={t('dashboard.upcomingTitle')}>
      {items.length === 0 ? (
        <EmptyState icon="calendar" title={t('dashboard.upcomingEmpty')} />
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, limit).map((d) => (
            <li
              key={`${d.table}:${d.row.id}`}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3"
            >
              <SemaforoBadge light={d.light} />
              <div className="min-w-0 flex-1 basis-48">
                <Link
                  href={`${DEADLINE_PATH[d.table]}/${d.row.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {d.label || t(`dashboard.kinds.${d.table}`)}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {[
                    d.kind ?? t(`dashboard.kinds.${d.table}`),
                    scope.clientId ? '' : names.client(d.clienteId),
                    names.unit(d.entidadId ?? text(d.row, 'entidadId')),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="text-sm">
                <DueDate date={d.date} today={today} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
