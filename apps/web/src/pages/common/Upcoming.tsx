import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { text } from '@empirica/shared';
import { useNames } from '../../data/names.ts';
import {
  taskSemaforo,
  todayInCancun,
  upcoming,
  urgencyOf,
  type Deadline,
} from '../../domain/deadlines.ts';
import { useScope, useScopedRows } from '../../portal/scope.ts';
import { Card, EmptyState } from '../../ui/Card.tsx';
import { DueDate, SemaforoBadge } from './Semaforo.tsx';

const DAYS = 30;

function lightOf(d: Deadline, today: string) {
  if (d.table === 'Tareas') return taskSemaforo(d.row, today);
  const u = urgencyOf(d.date, today);
  return u === 'none' ? 'noDate' : u;
}

/**
 * Everything with a date in the next 30 days (and what is already overdue):
 * tasks, obligations, filings and contracts, soonest first.
 */
export function Upcoming({ limit = 8 }: { limit?: number }) {
  const { t } = useTranslation();
  const names = useNames();
  const { scope } = useScope();
  const tareas = useScopedRows('Tareas');
  const obligaciones = useScopedRows('Obligaciones');
  const tramites = useScopedRows('Tramites');
  const contratos = useScopedRows('Contratos');
  const today = todayInCancun();
  const items = useMemo(
    () =>
      upcoming(
        [
          { table: 'Tareas', rows: tareas ?? [], field: 'fechaLimite', label: 'titulo' },
          {
            table: 'Obligaciones',
            rows: obligaciones ?? [],
            field: 'proximoVencimiento',
            label: 'nombre',
          },
          { table: 'Tramites', rows: tramites ?? [], field: 'fechaLimite', label: 'autoridad' },
          {
            table: 'Contratos',
            rows: contratos ?? [],
            field: 'vigenciaHasta',
            label: 'contraparte',
          },
        ],
        today,
        DAYS,
      ),
    [tareas, obligaciones, tramites, contratos, today],
  );
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
              <SemaforoBadge light={lightOf(d, today)} />
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-medium">{d.label || t(`dashboard.kinds.${d.table}`)}</p>
                <p className="text-sm text-muted-foreground">
                  {[
                    t(`dashboard.kinds.${d.table}`),
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
