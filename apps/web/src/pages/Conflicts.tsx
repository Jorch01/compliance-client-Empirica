import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'wouter';
import {
  isTableName,
  text,
  type ConflictDecision,
  type ConflictResolveData,
  type Row,
  type TableName,
  type Value,
} from '@empirica/shared';
import { ApiCallError } from '../api/client.ts';
import { useRow } from '../data/hooks.ts';
import { useNames, type Names } from '../data/names.ts';
import { roleIn } from '../domain/access.ts';
import { linkOf } from '../domain/work.ts';
import { formatDate, formatDateTime } from '../i18n/index.ts';
import { denialText, fieldLabel, oneOf } from '../i18n/labels.ts';
import { useScopedRows } from '../portal/scope.ts';
import { useSyncStatus } from '../portal/sync-status.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { FilterButtons } from '../ui/FilterButtons.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';

/** Records a conflict can be about, with a name for people. */
const RECORD_KINDS = [
  'Asuntos',
  'Tareas',
  'Tramites',
  'Obligaciones',
  'CumplimientosHistorial',
  'Contratos',
  'Documentos',
  'Comentarios',
  'Eventos',
] as const;

/** A value as it was stored in the conflict (JSON text). */
function parsed(value: Value | undefined): Value {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value) as Value;
  } catch {
    return value;
  }
}

/** A value for people: dates, yes or no, who sees it, a person's name. */
function useShowValue(): (field: string, value: Value) => string {
  const { t } = useTranslation();
  const names: Names = useNames();
  return (field, value) => {
    if (value === null || value === '') return t('conflicts.blank');
    if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no');
    if (field === 'visibilidad' && (value === 'INTERNO' || value === 'COMPARTIDO')) {
      return t(`visibility.${value}`);
    }
    if (field === 'validadoPor' && typeof value === 'string') return names.user(value) || value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    return typeof value === 'string' ? value : JSON.stringify(value);
  };
}

/** Where a record is seen: its own page, or the page of what it belongs to. */
function pathOf(table: TableName, record: Row | null | undefined): string | null {
  if (!record || record.deleted) return null;
  if (table === 'Asuntos') return `/asuntos/${record.id}`;
  if (table === 'Tareas') return `/tareas/${record.id}`;
  if (table === 'Documentos' || table === 'Comentarios') {
    const link =
      table === 'Documentos'
        ? linkOf(record)
        : { tipo: text(record, 'tipoEntidad') ?? '', id: text(record, 'entidadId') ?? '' };
    if (link?.tipo === 'Asuntos') return `/asuntos/${link.id}`;
    if (link?.tipo === 'Tareas') return `/tareas/${link.id}`;
  }
  return null;
}

function ConflictItem({ conflict, highlighted }: { conflict: Row; highlighted: boolean }) {
  const { t } = useTranslation();
  const { me, engine, call } = usePortal();
  const names = useNames();
  const show = useShowValue();
  const sync = useSyncStatus();
  const tableName = text(conflict, 'entidad') ?? '';
  const table = isTableName(tableName) ? tableName : null;
  const record = useRow(table ?? 'Tareas', table ? (text(conflict, 'entidadId') ?? '') : undefined);
  const [busy, setBusy] = useState<ConflictDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const field = text(conflict, 'campo') ?? '';
  const clientId = text(conflict, 'clienteId');
  const rol = roleIn(me, clientId);
  const mayDecide = rol === 'SOCIO_ADMIN' || rol === 'ABOGADO';
  const offline = sync.phase === 'offline';
  const pending = conflict.estado === 'PENDIENTE';
  const path = table ? pathOf(table, record) : null;
  const label = record
    ? (text(record, 'titulo') ?? text(record, 'nombre') ?? text(record, 'texto')?.slice(0, 80))
    : null;

  const decide = async (decision: ConflictDecision): Promise<void> => {
    setError(null);
    setBusy(decision);
    try {
      const { data } = await call<ConflictResolveData>('conflicts.resolve', {
        conflictoId: conflict.id,
        decision,
      });
      await engine.accept('Conflictos', [data.conflicto]);
      if (data.record && table) await engine.accept(table, [data.record]);
    } catch (e) {
      setError(
        e instanceof ApiCallError ? denialText(t, e.reason, e.code) : t('conflicts.needsNetwork'),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <li
      ref={(el) => {
        if (el && highlighted) el.scrollIntoView({ block: 'center' });
      }}
      className={`rounded-card border p-4 ${highlighted ? 'border-primary' : 'border-border'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {[
              names.client(clientId),
              oneOf(RECORD_KINDS, table) ? t(`records.${table}`) : tableName,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="font-medium">
            {path ? (
              <Link href={path} className="underline-offset-2 hover:underline">
                {label ?? t('conflicts.record')}
              </Link>
            ) : (
              (label ?? t('conflicts.record'))
            )}
          </p>
          <p className="text-sm">
            {t('conflicts.field')}: <span className="font-medium">{fieldLabel(t, field)}</span>
          </p>
        </div>
        <StatusBadge tone={pending ? 'warning' : 'success'}>
          {pending ? t('conflicts.pending') : t('conflicts.resolved')}
        </StatusBadge>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-control border border-border bg-muted px-3 py-2">
          <dt className="text-sm text-muted-foreground">{t('conflicts.current')}</dt>
          <dd className="font-medium">{show(field, parsed(conflict.valorVigente))}</dd>
        </div>
        <div className="rounded-control border border-border px-3 py-2">
          <dt className="text-sm text-muted-foreground">
            {t('conflicts.proposedBy', {
              name: names.user(text(conflict, 'propuestoPor')) || '—',
              date: formatDateTime(text(conflict, 'createdAt')),
            })}
          </dt>
          <dd className="font-medium">{show(field, parsed(conflict.valorPropuesto))}</dd>
        </div>
      </dl>
      {pending && mayDecide ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              busy={busy === 'CONSERVAR'}
              disabled={offline || busy !== null}
              onClick={() => void decide('CONSERVAR')}
            >
              {t('conflicts.keep')}
            </Button>
            <Button
              size="sm"
              busy={busy === 'APLICAR'}
              disabled={offline || busy !== null}
              onClick={() => void decide('APLICAR')}
            >
              {t('conflicts.apply')}
            </Button>
          </div>
          {offline ? (
            <p className="text-sm text-muted-foreground">{t('conflicts.needsNetwork')}</p>
          ) : null}
        </div>
      ) : null}
      {pending && !mayDecide ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('conflicts.whoDecides')}</p>
      ) : null}
      {!pending ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t(conflict.decision === 'APLICAR' ? 'conflicts.decidedApply' : 'conflicts.decidedKeep', {
            name: names.user(text(conflict, 'resueltoPor')) || '—',
            date: formatDateTime(text(conflict, 'updatedAt')),
          })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-danger-subtle-foreground">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * "Conflictos" (firm): two people changed a legally sensitive field at the
 * same time; the value in force stayed. A partner or the client's lawyer
 * decides which one holds (PLAN.md § 5).
 */
export function ConflictsPage() {
  const { t } = useTranslation();
  const params = useParams<{ id?: string }>();
  const conflicts = useScopedRows('Conflictos');
  const highlighted = params.id;
  const [view, setView] = useState<'pending' | 'resolved'>(() =>
    highlighted && conflicts?.find((c) => c.id === highlighted)?.estado === 'RESUELTO'
      ? 'resolved'
      : 'pending',
  );
  const shown = useMemo(
    () =>
      (conflicts ?? [])
        .filter((c) => (view === 'pending' ? c.estado === 'PENDIENTE' : c.estado !== 'PENDIENTE'))
        .sort((a, b) => (text(b, 'createdAt') ?? '').localeCompare(text(a, 'createdAt') ?? '')),
    [conflicts, view],
  );
  return (
    <>
      <PageHeader title={t('conflicts.title')}>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('conflicts.intro')}</p>
      </PageHeader>
      <Card>
        <div className="mb-4">
          <FilterButtons
            label={t('matters.filterLabel')}
            value={view}
            onChange={setView}
            options={[
              { value: 'pending', label: t('conflicts.pending') },
              { value: 'resolved', label: t('conflicts.resolved') },
            ]}
          />
        </div>
        {shown.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title={view === 'pending' ? t('conflicts.empty') : t('conflicts.emptyResolved')}
          />
        ) : (
          <ul className="space-y-3">
            {shown.map((c) => (
              <ConflictItem key={c.id} conflict={c} highlighted={c.id === highlighted} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
