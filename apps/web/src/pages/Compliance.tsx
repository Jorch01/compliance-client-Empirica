import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import {
  CATEGORIAS_OBLIGACION,
  complianceMatrix,
  matrixTotals,
  monthsOfYear,
  obligationState,
  text,
  type MatrixCell,
  type ObligationState,
  type Period,
  type Row,
} from '@empirica/shared';
import { usePendingIds } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { todayInCancun } from '../domain/deadlines.ts';
import { categoryLabel, riskLabel } from '../i18n/labels.ts';
import { useScope, useScopedAllRows, useScopedRows } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { SelectField, TextField } from '../ui/Field.tsx';
import { FilterButtons } from '../ui/FilterButtons.tsx';
import { Icon } from '../ui/Icon.tsx';
import { InfoButton } from '../ui/InfoButton.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { DueDate } from './common/Semaforo.tsx';
import { InternalMark } from './common/VisibilityField.tsx';
import { STATE_TONE, monthOfYear, useNonWorkingDays } from './compliance/compliance.ts';
import { Heatmap } from './compliance/Heatmap.tsx';
import { ObligationForm } from './compliance/ObligationForm.tsx';

type Filter = 'attention' | 'all' | 'inactive' | 'deleted';

const ATTENTION: ReadonlySet<ObligationState> = new Set([
  'vencido',
  'porVencer',
  'revision',
  'sinFecha',
]);

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** An obligation in a list: its state now and when its period is due. */
function ObligationItem({
  obligacion,
  estado,
  period,
  pending,
}: {
  obligacion: Row;
  estado: ObligationState;
  period: Period | null;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope } = useScope();
  const names = useNames();
  const today = todayInCancun();
  const clienteId = text(obligacion, 'clienteId');
  const restorable = Boolean(obligacion.deleted) && can(me, 'Obligaciones', 'delete', clienteId);
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <p>
          <Link
            href={`/compliance/${obligacion.id}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {text(obligacion, 'nombre')}
          </Link>
          {me.isFirm && obligacion.visibilidad === 'INTERNO' ? <InternalMark /> : null}
        </p>
        <p className="text-sm text-muted-foreground">
          {[
            scope.clientId ? '' : names.client(clienteId),
            names.unit(text(obligacion, 'entidadId')),
            categoryLabel(t, obligacion.categoria),
            obligacion.riesgo
              ? t('compliance.risk', { level: riskLabel(t, obligacion.riesgo) })
              : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {period?.rechazado ? (
          <p className="text-sm font-medium text-danger-subtle-foreground">
            {t('compliance.rejected')}
          </p>
        ) : null}
        {pending ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name="cloudOff" className="size-3.5" />
            {t('common.pendingSync')}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge tone={STATE_TONE[estado]}>{t(`compliance.states.${estado}`)}</StatusBadge>
        {period && estado !== 'cumplido' ? (
          <span>
            <span className="text-muted-foreground">{t('compliance.dueOn')}: </span>
            <DueDate date={period.vence} today={today} />
          </span>
        ) : null}
        {restorable ? (
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            onClick={() => void engine.mutate('Obligaciones', 'restore', obligacion.id)}
          >
            {t('matters.restore')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** The periods counted in one cell of the matrix. */
function CellDialog({
  cell,
  categoria,
  onClose,
}: {
  cell: MatrixCell | null;
  categoria: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const today = todayInCancun();
  const title = cell
    ? `${categoria ? categoryLabel(t, categoria) : t('compliance.total')} · ${monthOfYear(cell.month)}`
    : '';
  return (
    <Dialog open={cell !== null} onClose={onClose} title={title} size="lg">
      {cell ? (
        <ul className="divide-y divide-border">
          {cell.items.map(({ obligacion, period }) => (
            <li
              key={`${obligacion.id}:${period.periodo}`}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3"
            >
              <div className="min-w-0 flex-1 basis-56">
                <Link
                  href={`/compliance/${obligacion.id}`}
                  className="font-medium text-link underline-offset-2 hover:underline"
                >
                  {text(obligacion, 'nombre')}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {[
                    names.unit(text(obligacion, 'entidadId')),
                    categoria ? '' : categoryLabel(t, obligacion.categoria),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <StatusBadge tone={STATE_TONE[period.estado]}>
                  {t(`compliance.states.${period.estado}`)}
                </StatusBadge>
                <DueDate date={period.vence} today={today} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Dialog>
  );
}

/**
 * "Compliance": the matrix of the year by category and month, and the
 * obligations with what each one needs now. The firm records and edits
 * them; a client sees the shared ones and sends evidence.
 */
export function CompliancePage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { clients } = useScope();
  const [, navigate] = useLocation();
  const obligaciones = useScopedAllRows('Obligaciones');
  const cumplimientos = useScopedRows('CumplimientosHistorial');
  const pending = usePendingIds('Obligaciones');
  const inhabiles = useNonWorkingDays();
  const today = todayInCancun();
  const [year, setYear] = useState(() => Number(todayInCancun().slice(0, 4)));
  const [filter, setFilter] = useState<Filter>('attention');
  const [categoria, setCategoria] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<{ cell: MatrixCell; categoria: string | null } | null>(null);
  const [creating, setCreating] = useState(false);
  const canCreate = clients.some((c) => can(me, 'Obligaciones', 'create', c.id));
  const canRestore = me.isFirm && clients.some((c) => can(me, 'Obligaciones', 'delete', c.id));

  const live = useMemo(() => (obligaciones ?? []).filter((o) => !o.deleted), [obligaciones]);
  const months = useMemo(() => monthsOfYear(year), [year]);
  const matrix = useMemo(
    () =>
      complianceMatrix(live, cumplimientos ?? [], CATEGORIAS_OBLIGACION, months, today, inhabiles),
    [live, cumplimientos, months, today, inhabiles],
  );
  const totals = useMemo(() => matrixTotals(matrix, months), [matrix, months]);

  const states = useMemo(
    () =>
      new Map(
        (obligaciones ?? []).map((o) => [
          o.id,
          obligationState(o, cumplimientos ?? [], today, inhabiles),
        ]),
      ),
    [obligaciones, cumplimientos, today, inhabiles],
  );

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return (obligaciones ?? [])
      .filter((o) => {
        if (filter === 'deleted') return Boolean(o.deleted);
        if (o.deleted) return false;
        if (filter === 'inactive') return o.estado === 'INACTIVA';
        if (o.estado === 'INACTIVA') return false;
        return filter === 'all' || ATTENTION.has(states.get(o.id)?.estado ?? 'pendiente');
      })
      .filter((o) => !categoria || o.categoria === categoria)
      .filter((o) => !q || fold(text(o, 'nombre') ?? '').includes(q))
      .sort((a, b) => {
        const va = states.get(a.id)?.period?.vence ?? '9999';
        const vb = states.get(b.id)?.period?.vence ?? '9999';
        return (
          va.localeCompare(vb) ||
          (text(a, 'nombre') ?? '').localeCompare(text(b, 'nombre') ?? '', 'es')
        );
      });
  }, [obligaciones, filter, categoria, query, states]);

  const filters: { value: Filter; label: string }[] = [
    { value: 'attention', label: t('compliance.filters.attention') },
    { value: 'all', label: t('compliance.filters.all') },
    { value: 'inactive', label: t('compliance.filters.inactive') },
    ...(canRestore ? [{ value: 'deleted' as const, label: t('compliance.filters.deleted') }] : []),
  ];

  return (
    <>
      <PageHeader
        title={t('compliance.title')}
        actions={
          <>
            {me.isFirm ? (
              <>
                <Link href="/compliance/catalogo" className={buttonClass('secondary')}>
                  {t('compliance.catalog')}
                </Link>
                <Link href="/compliance/inhabiles" className={buttonClass('secondary')}>
                  {t('compliance.nonWorkingDays')}
                </Link>
              </>
            ) : null}
            {canCreate ? (
              <Button
                icon="plus"
                onClick={() => {
                  setCreating(true);
                }}
              >
                {t('compliance.new')}
              </Button>
            ) : null}
          </>
        }
      >
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {me.isFirm ? t('compliance.intro') : t('compliance.introClient')}
        </p>
      </PageHeader>

      <Card
        title={t('compliance.matrixTitle', { year })}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon="chevronLeft"
              aria-label={t('compliance.prevYear')}
              onClick={() => {
                setYear((y) => y - 1);
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              icon="chevronRight"
              aria-label={t('compliance.nextYear')}
              onClick={() => {
                setYear((y) => y + 1);
              }}
            />
            <InfoButton
              content={{
                title: t('compliance.info.title'),
                purpose: t('compliance.info.purpose'),
                howToRead: t('compliance.info.howToRead', { returnObjects: true }),
                example: t('compliance.info.example'),
              }}
            />
          </div>
        }
      >
        {matrix.length === 0 ? (
          <EmptyState icon="clipboard" title={t('compliance.matrixEmpty')} />
        ) : (
          <Heatmap
            year={year}
            rows={matrix}
            totals={totals}
            onOpen={(cell, cat) => {
              setOpen({ cell, categoria: cat });
            }}
          />
        )}
      </Card>

      <div className="mt-6">
        <Card title={t('compliance.listTitle')}>
          <div className="mb-4 space-y-3">
            <FilterButtons
              label={t('compliance.filterLabel')}
              value={filter}
              options={filters}
              onChange={setFilter}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={t('common.search')}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
              />
              <SelectField
                label={t('fields.categoria')}
                value={categoria}
                onChange={(e) => {
                  setCategoria(e.target.value);
                }}
                options={[
                  { value: '', label: t('compliance.anyCategory') },
                  ...CATEGORIAS_OBLIGACION.map((c) => ({ value: c, label: categoryLabel(t, c) })),
                ]}
              />
            </div>
          </div>
          {shown.length === 0 ? (
            <EmptyState
              icon="clipboard"
              title={live.length || me.isFirm ? t('compliance.empty') : t('compliance.emptyClient')}
            />
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((o) => {
                const s = states.get(o.id);
                return (
                  <ObligationItem
                    key={o.id}
                    obligacion={o}
                    estado={s?.estado ?? 'sinFecha'}
                    period={s?.period ?? null}
                    pending={pending.has(o.id)}
                  />
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <CellDialog
        cell={open?.cell ?? null}
        categoria={open?.categoria ?? null}
        onClose={() => {
          setOpen(null);
        }}
      />
      {creating ? (
        <ObligationForm
          onClose={() => {
            setCreating(false);
          }}
          onSaved={(id) => {
            navigate(`/compliance/${id}`);
          }}
        />
      ) : null}
    </>
  );
}
