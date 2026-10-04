import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'wouter';
import { ESTADOS_TRAMITE, filingDate, text } from '@empirica/shared';
import { usePendingIds, useRow } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { todayInCancun } from '../domain/deadlines.ts';
import { formatDate } from '../i18n/index.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader, Spinner } from '../ui/Card.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { SelectField } from '../ui/Field.tsx';
import { Icon } from '../ui/Icon.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { Comments } from './common/Comments.tsx';
import { Documents } from './common/Documents.tsx';
import { DueDate, SemaforoBadge } from './common/Semaforo.tsx';
import { InternalMark } from './common/VisibilityField.tsx';
import { FilingForm } from './filings/FilingForm.tsx';
import { FILING_TONE, filingSemaforo, filingState, useTemplates } from './filings/filings.ts';
import { StageTimeline } from './filings/StageTimeline.tsx';

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/**
 * A filing: its stages (behind, current, ahead), its dates, the
 * conversation and its documents. The firm moves it along and edits it; a
 * client follows it.
 */
export function FilingDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { me, engine } = usePortal();
  const [, navigate] = useLocation();
  const names = useNames();
  const filing = useRow('Tramites', id);
  const matter = useRow('Asuntos', filing ? (text(filing, 'asuntoId') ?? undefined) : undefined);
  const templates = useTemplates();
  const pending = usePendingIds('Tramites');
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (filing === undefined) return <Spinner label={t('common.loading')} />;
  const clientId = filing ? text(filing, 'clienteId') : null;
  const mayDelete = me.isFirm && can(me, 'Tramites', 'delete', clientId);
  if (filing === null || (filing.deleted && !mayDelete)) {
    return (
      <EmptyState
        icon="search"
        title={t('filings.notFound')}
        action={
          <Link href="/tramites" className={`${buttonClass('primary')} mt-2`}>
            {t('filings.back')}
          </Link>
        }
      />
    );
  }

  const deleted = Boolean(filing.deleted);
  const estado = filingState(filing);
  const today = todayInCancun();
  const template = templates.get(text(filing, 'plantillaId') ?? '');
  const mayEdit = me.isFirm && can(me, 'Tramites', 'update', clientId) && !deleted;
  const date = filingDate(filing);

  return (
    <>
      <p className="mb-2">
        <Link
          href="/tramites"
          className="inline-flex items-center gap-1 text-sm text-link hover:underline"
        >
          <Icon name="chevronRight" className="size-4 rotate-180" />
          {t('filings.back')}
        </Link>
      </p>
      <PageHeader
        eyebrow={[names.client(clientId), names.unit(text(filing, 'entidadId'))]
          .filter(Boolean)
          .join(' · ')}
        title={text(filing, 'titulo') ?? text(filing, 'autoridad') ?? ''}
        actions={
          <>
            {mayEdit ? (
              <Button
                variant="secondary"
                icon="pencil"
                onClick={() => {
                  setEditing(true);
                }}
              >
                {t('filings.edit')}
              </Button>
            ) : null}
            {mayDelete && !deleted ? (
              <Button
                variant="ghost"
                icon="trash"
                onClick={() => {
                  setConfirm(true);
                }}
              >
                {t('filings.deleteTitle')}
              </Button>
            ) : null}
            {mayDelete && deleted ? (
              <Button
                icon="refresh"
                onClick={() => void engine.mutate('Tramites', 'restore', filing.id)}
              >
                {t('matters.restore')}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {estado ? (
            <StatusBadge tone={FILING_TONE[estado]}>{t(`filings.estados.${estado}`)}</StatusBadge>
          ) : null}
          {date && estado !== 'CONCLUIDO' && estado !== 'CANCELADO' ? (
            <SemaforoBadge light={filingSemaforo(filing, today)} />
          ) : null}
          {me.isFirm && filing.visibilidad === 'INTERNO' ? <InternalMark /> : null}
        </div>
      </PageHeader>

      {deleted ? (
        <p
          role="status"
          className="mb-4 rounded-control border border-warning-border bg-warning-subtle px-4 py-2 text-warning-subtle-foreground"
        >
          {t('filings.deleted')}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t('filings.stagesTitle')}>
            <StageTimeline filing={filing} stages={template?.stages ?? []} editable={mayEdit} />
            {mayEdit ? (
              <div className="mt-4 max-w-xs">
                <SelectField
                  label={t('filings.changeState')}
                  value={estado ?? ''}
                  onChange={(e) => {
                    const next = ESTADOS_TRAMITE.find((s) => s === e.target.value);
                    if (next) void engine.mutate('Tramites', 'update', filing.id, { estado: next });
                  }}
                  options={ESTADOS_TRAMITE.map((s) => ({
                    value: s,
                    label: t(`filings.estados.${s}`),
                  }))}
                />
              </div>
            ) : null}
            {pending.has(filing.id) ? (
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Icon name="cloudOff" className="size-3.5" />
                {t('common.pendingSync')}
              </p>
            ) : null}
          </Card>
          <Comments table="Tramites" record={filing} />
        </div>
        <div className="space-y-6">
          <Card title={t('filings.data')}>
            <dl className="space-y-3">
              {text(filing, 'autoridad') ? (
                <Fact term={t('fields.autoridad')}>{text(filing, 'autoridad')}</Fact>
              ) : null}
              {text(filing, 'folioExpediente') ? (
                <Fact term={t('fields.folioExpediente')}>{text(filing, 'folioExpediente')}</Fact>
              ) : null}
              {text(filing, 'fechaPresentacion') ? (
                <Fact term={t('fields.fechaPresentacion')}>
                  {formatDate(text(filing, 'fechaPresentacion'))}
                </Fact>
              ) : null}
              {text(filing, 'proximaActuacion') ? (
                <Fact term={t('fields.proximaActuacion')}>
                  <DueDate date={text(filing, 'proximaActuacion') ?? ''} today={today} />
                </Fact>
              ) : null}
              <Fact term={t('fields.fechaLimite')}>
                {text(filing, 'fechaLimite') ? (
                  <DueDate date={text(filing, 'fechaLimite') ?? ''} today={today} />
                ) : (
                  t('semaforo.noDate')
                )}
              </Fact>
              {matter && !matter.deleted ? (
                <Fact term={t('fields.asuntoId')}>
                  <Link href={`/asuntos/${matter.id}`} className="text-link hover:underline">
                    {text(matter, 'titulo')}
                  </Link>
                </Fact>
              ) : null}
              {me.isFirm ? (
                <Fact term={t('fields.plantillaId')}>
                  {template ? text(template.row, 'nombre') : t('filings.noTemplate')}
                </Fact>
              ) : null}
            </dl>
          </Card>
          <Documents
            table="Tramites"
            record={filing}
            defaultArea={matter ? (text(matter, 'area') ?? '') : ''}
          />
        </div>
      </div>

      {editing ? (
        <FilingForm
          filing={filing}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirm}
        title={t('filings.deleteTitle')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          setConfirm(false);
          void engine.mutate('Tramites', 'delete', filing.id).then(() => {
            navigate('/tramites');
          });
        }}
        onClose={() => {
          setConfirm(false);
        }}
      >
        <p>{t('filings.deleteBody')}</p>
      </ConfirmDialog>
    </>
  );
}
