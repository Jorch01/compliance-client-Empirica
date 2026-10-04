import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import {
  OPEN_FILING_STATES,
  filingDate,
  isOpenFiling,
  stageProgress,
  stageSince,
  text,
  type EstadoTramite,
  type Row,
} from '@empirica/shared';
import { usePendingIds } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { daysBetween, todayInCancun } from '../domain/deadlines.ts';
import { useScope, useScopedAllRows } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { TextField } from '../ui/Field.tsx';
import { FilterButtons } from '../ui/FilterButtons.tsx';
import { Icon } from '../ui/Icon.tsx';
import { InfoButton } from '../ui/InfoButton.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { DueDate, SemaforoBadge } from './common/Semaforo.tsx';
import { InternalMark } from './common/VisibilityField.tsx';
import { FilingForm } from './filings/FilingForm.tsx';
import {
  FILING_TONE,
  filingSemaforo,
  filingState,
  useTemplates,
  type Template,
} from './filings/filings.ts';

type Filter = 'open' | 'closed' | 'deleted';

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** One filing on the board or in a list: where it stands and what date comes. */
function FilingCard({
  filing,
  pending,
  templates,
}: {
  filing: Row;
  pending: boolean;
  templates: ReadonlyMap<string, Template>;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope } = useScope();
  const names = useNames();
  const today = todayInCancun();
  const template = templates.get(text(filing, 'plantillaId') ?? '');
  const progress = template ? stageProgress(filing, template.stages) : null;
  const etapa = text(filing, 'etapaActual');
  const since = stageSince(filing);
  const date = filingDate(filing);
  const estado = filingState(filing);
  const clienteId = text(filing, 'clienteId');
  const restorable = Boolean(filing.deleted) && can(me, 'Tramites', 'delete', clienteId);
  return (
    <li className="rounded-control border border-border bg-card p-3 shadow-subtle">
      <p>
        <Link
          href={`/tramites/${filing.id}`}
          className="font-medium underline-offset-2 hover:underline"
        >
          {text(filing, 'titulo') ?? text(filing, 'autoridad') ?? '—'}
        </Link>
        {me.isFirm && filing.visibilidad === 'INTERNO' ? <InternalMark /> : null}
      </p>
      <p className="text-sm text-muted-foreground">
        {[
          scope.clientId ? '' : names.client(clienteId),
          names.unit(text(filing, 'entidadId')),
          text(filing, 'autoridad') ?? '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <p className="mt-2 text-sm">
        <span className="text-muted-foreground">{t('filings.stage')}: </span>
        {etapa ?? t('filings.noStage')}
        {progress && progress.index >= 0
          ? ` · ${t('filings.stageOf', { n: progress.index + 1, total: progress.total })}`
          : ''}
      </p>
      {since && isOpenFiling(filing) ? (
        <p className="text-sm text-muted-foreground">
          {t('filings.daysInStage', { count: Math.max(0, daysBetween(since, today)) })}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {estado && !isOpenFiling(filing) ? (
          <StatusBadge tone={FILING_TONE[estado]}>{t(`filings.estados.${estado}`)}</StatusBadge>
        ) : (
          <SemaforoBadge light={filingSemaforo(filing, today)} />
        )}
        {date && isOpenFiling(filing) ? <DueDate date={date} today={today} /> : null}
      </div>
      {pending ? (
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Icon name="cloudOff" className="size-3.5" />
          {t('common.pendingSync')}
        </p>
      ) : null}
      {restorable ? (
        <Button
          size="sm"
          variant="secondary"
          icon="refresh"
          className="mt-2"
          onClick={() => void engine.mutate('Tramites', 'restore', filing.id)}
        >
          {t('matters.restore')}
        </Button>
      ) : null}
    </li>
  );
}

/** The open filings in three columns: in preparation, filed, and answering the authority. */
function Board({
  filings,
  pending,
  templates,
}: {
  filings: Row[];
  pending: ReadonlySet<string>;
  templates: ReadonlyMap<string, Template>;
}) {
  const { t } = useTranslation();
  const byState = (estado: EstadoTramite): Row[] => filings.filter((f) => f.estado === estado);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {OPEN_FILING_STATES.map((estado) => {
        const list = byState(estado);
        return (
          <section
            key={estado}
            aria-labelledby={`col-${estado}`}
            className="rounded-card border border-border bg-muted p-3"
          >
            <h2
              id={`col-${estado}`}
              className="mb-3 flex items-center justify-between gap-2 font-semibold"
            >
              {t(`filings.estados.${estado}`)}
              <span className="rounded-full bg-card px-2 font-sans text-sm tabular-nums">
                {list.length}
              </span>
            </h2>
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('filings.emptyColumn')}</p>
            ) : (
              <ul className="space-y-3">
                {list.map((f) => (
                  <FilingCard
                    key={f.id}
                    filing={f}
                    pending={pending.has(f.id)}
                    templates={templates}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * "Trámites": the pipeline of filings by state, each at its stage and with
 * its next date. The firm opens, moves and closes them; a client follows
 * the shared ones.
 */
export function FilingsPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { clients } = useScope();
  const [, navigate] = useLocation();
  const filings = useScopedAllRows('Tramites');
  const templates = useTemplates();
  const pending = usePendingIds('Tramites');
  const [filter, setFilter] = useState<Filter>('open');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = clients.some((c) => can(me, 'Tramites', 'create', c.id));
  const canRestore = me.isFirm && clients.some((c) => can(me, 'Tramites', 'delete', c.id));

  const shown = useMemo(() => {
    const q = fold(query.trim());
    const matches = (f: Row): boolean =>
      !q ||
      ['titulo', 'autoridad', 'folioExpediente', 'etapaActual'].some((c) =>
        fold(text(f, c) ?? '').includes(q),
      );
    return (filings ?? [])
      .filter((f) => {
        if (filter === 'deleted') return Boolean(f.deleted);
        if (f.deleted) return false;
        return filter === 'open' ? isOpenFiling(f) : !isOpenFiling(f);
      })
      .filter(matches)
      .sort(
        (a, b) =>
          (filingDate(a) ?? '9999').localeCompare(filingDate(b) ?? '9999') ||
          (text(a, 'titulo') ?? '').localeCompare(text(b, 'titulo') ?? '', 'es'),
      );
  }, [filings, filter, query]);

  const filters: { value: Filter; label: string }[] = [
    { value: 'open', label: t('filings.filters.open') },
    { value: 'closed', label: t('filings.filters.closed') },
    ...(canRestore ? [{ value: 'deleted' as const, label: t('filings.filters.deleted') }] : []),
  ];
  const anyLive = (filings ?? []).some((f) => !f.deleted);

  return (
    <>
      <PageHeader
        title={t('filings.title')}
        actions={
          <>
            {me.isFirm ? (
              <Link href="/tramites/plantillas" className={buttonClass('secondary')}>
                {t('filings.templates')}
              </Link>
            ) : null}
            {canCreate ? (
              <Button
                icon="plus"
                onClick={() => {
                  setCreating(true);
                }}
              >
                {t('filings.new')}
              </Button>
            ) : null}
          </>
        }
      >
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {me.isFirm ? t('filings.intro') : t('filings.introClient')}
        </p>
      </PageHeader>
      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FilterButtons
              label={t('filings.filterLabel')}
              value={filter}
              options={filters}
              onChange={setFilter}
            />
            <InfoButton
              content={{
                title: t('filings.info.title'),
                purpose: t('filings.info.purpose'),
                howToRead: t('filings.info.howToRead', { returnObjects: true }),
                example: t('filings.info.example'),
              }}
            />
          </div>
          <div className="max-w-sm">
            <TextField
              label={t('common.search')}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
          </div>
        </div>
        {!anyLive && filter === 'open' && !query ? (
          <EmptyState
            icon="scale"
            title={me.isFirm ? t('filings.empty') : t('filings.emptyClient')}
          />
        ) : filter === 'open' ? (
          <Board filings={shown} pending={pending} templates={templates} />
        ) : shown.length === 0 ? (
          <EmptyState icon="scale" title={t('filings.empty')} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {shown.map((f) => (
              <FilingCard key={f.id} filing={f} pending={pending.has(f.id)} templates={templates} />
            ))}
          </ul>
        )}
      </Card>
      {creating ? (
        <FilingForm
          onClose={() => {
            setCreating(false);
          }}
          onSaved={(id) => {
            navigate(`/tramites/${id}`);
          }}
        />
      ) : null}
    </>
  );
}
