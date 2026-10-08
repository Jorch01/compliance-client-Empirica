import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { AREAS, ESTADOS_ASUNTO, progressOf, text, type Row } from '@empirica/shared';
import { usePendingIds } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { areaLabel, oneOf } from '../i18n/labels.ts';
import { useScope, useScopedAllRows } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { SelectField, TextField } from '../ui/Field.tsx';
import { FilterButtons } from '../ui/FilterButtons.tsx';
import { Icon } from '../ui/Icon.tsx';
import { ProgressBar } from '../ui/ProgressBar.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { InternalMark } from './common/VisibilityField.tsx';
import { MatterForm } from './matters/MatterForm.tsx';
import {
  MATTER_TONE,
  matterProgressText,
  restoreMatter,
  useMatterTasks,
} from './matters/matters.ts';
import { AiDraftButton } from './common/AiDraft.tsx';

type Filter = 'open' | 'closed' | 'deleted' | 'all';

/** Accents and case do not matter when searching ("tramite" finds "Trámite"). */
const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function MatterItem({
  matter,
  tasks,
  deleted,
  pending,
}: {
  matter: Row;
  tasks: readonly Row[];
  deleted: boolean;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope } = useScope();
  const names = useNames();
  const estado = oneOf(ESTADOS_ASUNTO, matter.estado) ? matter.estado : null;
  const avance = progressOf(tasks);
  const clienteId = text(matter, 'clienteId');
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <p>
          <Link
            href={`/asuntos/${matter.id}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {text(matter, 'titulo')}
          </Link>
          {me.isFirm && matter.visibilidad === 'INTERNO' ? <InternalMark /> : null}
        </p>
        <p className="text-sm text-muted-foreground">
          {[
            scope.clientId ? '' : names.client(clienteId),
            names.unit(text(matter, 'entidadId')),
            areaLabel(t, matter.area),
            names.user(text(matter, 'responsableId')),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {pending ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name="cloudOff" className="size-3.5" />
            {t('common.pendingSync')}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {estado ? (
          <StatusBadge tone={MATTER_TONE[estado]}>{t(`matters.estados.${estado}`)}</StatusBadge>
        ) : null}
        {avance === null ? (
          <span className="text-sm text-muted-foreground">{t('matters.noTasks')}</span>
        ) : (
          <ProgressBar value={avance} text={matterProgressText(t, tasks)} />
        )}
        {deleted && can(me, 'Asuntos', 'delete', clienteId) ? (
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            onClick={() => void restoreMatter(engine, matter)}
          >
            {t('matters.restore')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** "Asuntos": the matters in view, with their progress; the firm opens and restores them. */
export function MattersPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { clients } = useScope();
  const [, navigate] = useLocation();
  const matters = useScopedAllRows('Asuntos');
  const tasksOf = useMatterTasks();
  const pending = usePendingIds('Asuntos');
  const [filter, setFilter] = useState<Filter>('open');
  const [area, setArea] = useState('');
  const [owner, setOwner] = useState<'all' | 'mine'>('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const canCreate = clients.some((c) => can(me, 'Asuntos', 'create', c.id));
  const canRestore = me.isFirm && clients.some((c) => can(me, 'Asuntos', 'delete', c.id));

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return (matters ?? [])
      .filter((m) => {
        if (filter === 'deleted') return Boolean(m.deleted);
        if (m.deleted) return false;
        if (filter === 'open') return m.estado !== 'CONCLUIDO';
        if (filter === 'closed') return m.estado === 'CONCLUIDO';
        return true;
      })
      .filter((m) => !area || m.area === area)
      .filter((m) => owner === 'all' || m.responsableId === me.id)
      .filter((m) => !q || fold(text(m, 'titulo') ?? '').includes(q))
      .sort(
        (a, b) =>
          Number(a.estado === 'CONCLUIDO') - Number(b.estado === 'CONCLUIDO') ||
          (text(a, 'fechaObjetivo') ?? '9999').localeCompare(text(b, 'fechaObjetivo') ?? '9999') ||
          (text(a, 'titulo') ?? '').localeCompare(text(b, 'titulo') ?? '', 'es'),
      );
  }, [matters, filter, area, owner, query, me.id]);

  const filters: { value: Filter; label: string }[] = [
    { value: 'open', label: t('matters.filters.open') },
    { value: 'closed', label: t('matters.filters.closed') },
    ...(canRestore ? [{ value: 'deleted' as const, label: t('matters.filters.deleted') }] : []),
    { value: 'all', label: t('matters.filters.all') },
  ];

  return (
    <>
      <PageHeader
        title={t('matters.title')}
        actions={
          <>
            <AiDraftButton />
            {canCreate ? (
              <Button
                icon="plus"
                onClick={() => {
                  setCreating(true);
                }}
              >
                {t('matters.new')}
              </Button>
            ) : null}
          </>
        }
      >
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {me.isFirm ? t('matters.intro') : t('matters.introClient')}
        </p>
      </PageHeader>
      <Card>
        <div className="mb-4 space-y-3">
          <FilterButtons
            label={t('matters.filterLabel')}
            value={filter}
            options={filters}
            onChange={setFilter}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label={t('common.search')}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
            <SelectField
              label={t('fields.area')}
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
              }}
              options={[
                { value: '', label: t('matters.anyArea') },
                ...AREAS.map((a) => ({ value: a, label: areaLabel(t, a) })),
              ]}
            />
            {me.isFirm ? (
              <SelectField
                label={t('fields.responsableId')}
                value={owner}
                onChange={(e) => {
                  setOwner(e.target.value === 'mine' ? 'mine' : 'all');
                }}
                options={[
                  { value: 'all', label: t('matters.anyone') },
                  { value: 'mine', label: t('matters.mine') },
                ]}
              />
            ) : null}
          </div>
        </div>
        {shown.length === 0 ? (
          <EmptyState
            icon="building"
            title={
              (matters ?? []).some((m) => !m.deleted) || me.isFirm
                ? t('matters.empty')
                : t('matters.emptyClient')
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((m) => (
              <MatterItem
                key={m.id}
                matter={m}
                tasks={tasksOf(m.id)}
                deleted={Boolean(m.deleted)}
                pending={pending.has(m.id)}
              />
            ))}
          </ul>
        )}
      </Card>
      {creating ? (
        <MatterForm
          onClose={() => {
            setCreating(false);
          }}
          onSaved={(id) => {
            navigate(`/asuntos/${id}`);
          }}
        />
      ) : null}
    </>
  );
}
