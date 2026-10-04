import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'wouter';
import {
  LADOS_RESPONSABLE,
  addDays,
  obligationState,
  recordsByPeriod,
  text,
  type Row,
} from '@empirica/shared';
import { usePendingIds, useRow, useRows } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { todayInCancun } from '../domain/deadlines.ts';
import { formatDate } from '../i18n/index.ts';
import { categoryLabel, oneOf, riskLabel } from '../i18n/labels.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader, Spinner } from '../ui/Card.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { Comments } from './common/Comments.tsx';
import { Documents } from './common/Documents.tsx';
import { DueDate } from './common/Semaforo.tsx';
import { InternalMark } from './common/VisibilityField.tsx';
import {
  RISK_TONE,
  STATE_TONE,
  describeRule,
  nextDates,
  riskOf,
  useMaySendEvidence,
  useNonWorkingDays,
} from './compliance/compliance.ts';
import { EvidenceDialog, RecordItem } from './compliance/Evidence.tsx';
import { ObligationForm } from './compliance/ObligationForm.tsx';

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="font-medium whitespace-pre-line">{children}</dd>
    </div>
  );
}

const newestFirst = (a: Row, b: Row): number =>
  (text(b, 'createdAt') ?? '').localeCompare(text(a, 'createdAt') ?? '');

/**
 * An obligation: what is due now (and its evidence), its history period by
 * period, the next dates, the conversation and its documents. The firm
 * validates, turns down and edits; a client sends evidence.
 */
export function ObligationDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { me, engine } = usePortal();
  const [, navigate] = useLocation();
  const names = useNames();
  const obligation = useRow('Obligaciones', id);
  const clientId = obligation ? text(obligation, 'clienteId') : null;
  const records = useRows('CumplimientosHistorial', clientId);
  const pendingRecords = usePendingIds('CumplimientosHistorial');
  const inhabiles = useNonWorkingDays();
  const maySend = useMaySendEvidence(clientId);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const today = todayInCancun();
  const mine = useMemo(() => (records ?? []).filter((r) => r.obligacionId === id), [records, id]);

  if (obligation === undefined) return <Spinner label={t('common.loading')} />;
  const mayDelete = me.isFirm && can(me, 'Obligaciones', 'delete', clientId);
  if (obligation === null || (obligation.deleted && !mayDelete)) {
    return (
      <EmptyState
        icon="search"
        title={t('compliance.notFound')}
        action={
          <Link href="/compliance" className={`${buttonClass('primary')} mt-2`}>
            {t('compliance.back')}
          </Link>
        }
      />
    );
  }

  const deleted = Boolean(obligation.deleted);
  const mayEdit = me.isFirm && can(me, 'Obligaciones', 'update', clientId) && !deleted;
  const { estado, period } = obligationState(obligation, mine, today, inhabiles);
  const rule = text(obligation, 'recurrencia');
  const anchor = text(obligation, 'proximoVencimiento');
  const byPeriod = recordsByPeriod(obligation.id, mine);
  const history = [...byPeriod.entries()]
    .filter(([periodo]) => periodo !== period?.periodo)
    .sort(([a], [b]) => b.localeCompare(a));
  const upcoming = anchor
    ? nextDates(rule, anchor, period ? addDays(period.periodo, 1) : anchor, 3)
    : [];
  const risk = riskOf(obligation);

  return (
    <>
      <p className="mb-2">
        <Link
          href="/compliance"
          className="inline-flex items-center gap-1 text-sm text-link hover:underline"
        >
          <Icon name="chevronLeft" className="size-4" />
          {t('compliance.back')}
        </Link>
      </p>
      <PageHeader
        eyebrow={[names.client(clientId), names.unit(text(obligation, 'entidadId'))]
          .filter(Boolean)
          .join(' · ')}
        title={text(obligation, 'nombre') ?? ''}
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
                {t('compliance.edit')}
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
                {t('compliance.deleteTitle')}
              </Button>
            ) : null}
            {mayDelete && deleted ? (
              <Button
                icon="refresh"
                onClick={() => void engine.mutate('Obligaciones', 'restore', obligation.id)}
              >
                {t('matters.restore')}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge tone={STATE_TONE[estado]}>{t(`compliance.states.${estado}`)}</StatusBadge>
          {risk ? (
            <StatusBadge tone={RISK_TONE[risk]}>
              {t('compliance.risk', { level: riskLabel(t, risk) })}
            </StatusBadge>
          ) : null}
          <span className="text-sm text-muted-foreground">
            {categoryLabel(t, obligation.categoria)}
          </span>
          {me.isFirm && obligation.visibilidad === 'INTERNO' ? <InternalMark /> : null}
        </div>
      </PageHeader>

      {deleted ? (
        <p
          role="status"
          className="mb-4 rounded-control border border-warning-border bg-warning-subtle px-4 py-2 text-warning-subtle-foreground"
        >
          {t('compliance.deleted')}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t('compliance.currentTitle')}>
            {estado === 'inactiva' ? (
              <p>{t('compliance.inactiveNote')}</p>
            ) : estado === 'sinFecha' ? (
              <p>{t('compliance.noDate')}</p>
            ) : !period ? (
              <p className="inline-flex items-center gap-2">
                <Icon name="checkCircle" className="size-5 text-success" />
                {t('compliance.noCurrent')}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <p className="font-semibold">
                    {t('compliance.periodOf', { date: formatDate(period.periodo) })}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t('compliance.dueOn')}: </span>
                    <DueDate date={period.vence} today={today} />
                  </p>
                </div>
                {period.vence !== period.periodo ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('compliance.moved', { date: formatDate(period.periodo) })}
                  </p>
                ) : null}
                {period.registros.length ? (
                  <ul className="mt-2 divide-y divide-border">
                    {[...period.registros].sort(newestFirst).map((r) => (
                      <RecordItem key={r.id} record={r} pending={pendingRecords.has(r.id)} />
                    ))}
                  </ul>
                ) : null}
                {maySend && !deleted ? (
                  <Button
                    className="mt-3"
                    icon={me.isFirm ? 'check' : 'send'}
                    onClick={() => {
                      setSending(period.periodo);
                    }}
                  >
                    {me.isFirm ? t('compliance.register') : t('compliance.sendEvidence')}
                  </Button>
                ) : null}
              </>
            )}
            {upcoming.length ? (
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-medium">{t('compliance.upcomingTitle')}: </span>
                {upcoming.map((d) => formatDate(d)).join(' · ')}
              </p>
            ) : null}
          </Card>

          <Card title={t('compliance.historyTitle')}>
            {history.length === 0 ? (
              <EmptyState icon="clock" title={t('compliance.historyEmpty')} />
            ) : (
              <div className="space-y-4">
                {history.map(([periodo, list]) => (
                  <section
                    key={periodo}
                    aria-label={t('compliance.periodOf', { date: formatDate(periodo) })}
                  >
                    <h3 className="font-semibold">
                      {t('compliance.periodOf', { date: formatDate(periodo) })}
                    </h3>
                    <ul className="divide-y divide-border">
                      {[...list].sort(newestFirst).map((r) => (
                        <RecordItem key={r.id} record={r} pending={pendingRecords.has(r.id)} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Card>
          <Comments table="Obligaciones" record={obligation} />
        </div>
        <div className="space-y-6">
          <Card title={t('compliance.data')}>
            <dl className="space-y-3">
              <Fact term={t('fields.recurrencia')}>{describeRule(t, rule)}</Fact>
              <Fact term={t('fields.proximoVencimiento')}>
                {anchor ? formatDate(anchor) : t('semaforo.noDate')}
              </Fact>
              <Fact term={t('fields.recorreSiInhabil')}>
                {obligation.recorreSiInhabil === true ? t('compliance.movesYes') : t('common.no')}
              </Fact>
              {oneOf(LADOS_RESPONSABLE, obligation.ladoResponsable) ? (
                <Fact term={t('fields.ladoResponsable')}>
                  {t(`tasks.lados.${obligation.ladoResponsable}`)}
                </Fact>
              ) : null}
              {text(obligation, 'autoridad') ? (
                <Fact term={t('fields.autoridad')}>{text(obligation, 'autoridad')}</Fact>
              ) : null}
              {text(obligation, 'evidenciaRequerida') ? (
                <Fact term={t('fields.evidenciaRequerida')}>
                  {text(obligation, 'evidenciaRequerida')}
                </Fact>
              ) : null}
              {text(obligation, 'fundamento') ? (
                <Fact term={t('fields.fundamento')}>{text(obligation, 'fundamento')}</Fact>
              ) : null}
            </dl>
          </Card>
          <Documents table="Obligaciones" record={obligation} defaultArea="COMPLIANCE" />
        </div>
      </div>

      {editing ? (
        <ObligationForm
          obligation={obligation}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
      {sending ? (
        <EvidenceDialog
          obligation={obligation}
          periodo={sending}
          onClose={() => {
            setSending(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirm}
        title={t('compliance.deleteTitle')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          setConfirm(false);
          void engine.mutate('Obligaciones', 'delete', obligation.id).then(() => {
            navigate('/compliance');
          });
        }}
        onClose={() => {
          setConfirm(false);
        }}
      >
        <p>{t('compliance.deleteBody')}</p>
      </ConfirmDialog>
    </>
  );
}
