import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'wouter';
import { contractStatus, noticeDeadline, text } from '@empirica/shared';
import { useRow } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { todayInCancun } from '../domain/deadlines.ts';
import { formatDate } from '../i18n/index.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader, Spinner } from '../ui/Card.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { Comments } from './common/Comments.tsx';
import { DocumentFile } from './common/DocumentFile.tsx';
import { Documents } from './common/Documents.tsx';
import { DueDate } from './common/Semaforo.tsx';
import { InternalMark } from './common/VisibilityField.tsx';
import { ContractForm } from './contracts/ContractForm.tsx';
import { CONTRACT_TONE } from './contracts/contracts.ts';

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/**
 * A contract: its key dates in words (when to give notice, when it ends,
 * whether it renews by itself), its signed copy, the conversation and its
 * documents. The firm edits it; a client follows it.
 */
export function ContractDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { me, engine } = usePortal();
  const [, navigate] = useLocation();
  const names = useNames();
  const contract = useRow('Contratos', id);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (contract === undefined) return <Spinner label={t('common.loading')} />;
  const clientId = contract ? text(contract, 'clienteId') : null;
  const mayDelete = me.isFirm && can(me, 'Contratos', 'delete', clientId);
  if (contract === null || (contract.deleted && !mayDelete)) {
    return (
      <EmptyState
        icon="search"
        title={t('contracts.notFound')}
        action={
          <Link href="/contratos" className={`${buttonClass('primary')} mt-2`}>
            {t('contracts.back')}
          </Link>
        }
      />
    );
  }

  const deleted = Boolean(contract.deleted);
  const mayEdit = me.isFirm && can(me, 'Contratos', 'update', clientId) && !deleted;
  const today = todayInCancun();
  const status = contractStatus(contract, today);
  const end = text(contract, 'vigenciaHasta');
  const notice = noticeDeadline(contract);
  const autoRenews = contract.renovacionAutomatica === true;
  const summary = !end
    ? t('contracts.noDates')
    : autoRenews
      ? notice
        ? t('contracts.renewsNote', { end: formatDate(end), notice: formatDate(notice) })
        : t('contracts.renewsNoNotice', { end: formatDate(end) })
      : notice
        ? t('contracts.endsNoticeNote', { end: formatDate(end), notice: formatDate(notice) })
        : t('contracts.endsNote', { end: formatDate(end) });
  const docId = text(contract, 'docId');
  const dias = typeof contract.diasAvisoPrevio === 'number' ? contract.diasAvisoPrevio : null;

  return (
    <>
      <p className="mb-2">
        <Link
          href="/contratos"
          className="inline-flex items-center gap-1 text-sm text-link hover:underline"
        >
          <Icon name="chevronLeft" className="size-4" />
          {t('contracts.back')}
        </Link>
      </p>
      <PageHeader
        eyebrow={[names.client(clientId), names.unit(text(contract, 'entidadId'))]
          .filter(Boolean)
          .join(' · ')}
        title={text(contract, 'contraparte') ?? ''}
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
                {t('contracts.edit')}
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
                {t('contracts.deleteTitle')}
              </Button>
            ) : null}
            {mayDelete && deleted ? (
              <Button
                icon="refresh"
                onClick={() => void engine.mutate('Contratos', 'restore', contract.id)}
              >
                {t('matters.restore')}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge tone={CONTRACT_TONE[status]}>{t(`contracts.status.${status}`)}</StatusBadge>
          {text(contract, 'tipo') ? (
            <span className="text-sm text-muted-foreground">{text(contract, 'tipo')}</span>
          ) : null}
          {me.isFirm && contract.visibilidad === 'INTERNO' ? <InternalMark /> : null}
        </div>
      </PageHeader>

      {deleted ? (
        <p
          role="status"
          className="mb-4 rounded-control border border-warning-border bg-warning-subtle px-4 py-2 text-warning-subtle-foreground"
        >
          {t('contracts.deleted')}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t('contracts.keyDatesTitle')}>
            <p className="mb-4">{summary}</p>
            <ol className="space-y-3">
              {text(contract, 'fechaFirma') ? (
                <li className="flex gap-3">
                  <Icon name="checkCircle" className="mt-0.5 size-5 text-success" />
                  <p>
                    <span className="font-medium">{t('contracts.signed')}</span>
                    {' · '}
                    {formatDate(text(contract, 'fechaFirma'))}
                  </p>
                </li>
              ) : null}
              {notice ? (
                <li className="flex gap-3">
                  <Icon
                    name={notice < today ? 'checkCircle' : 'clock'}
                    className={`mt-0.5 size-5 ${notice < today ? 'text-muted-foreground' : 'text-warning'}`}
                  />
                  <p>
                    <span className="font-medium">{t('contracts.noticeBy')}</span>
                    {' · '}
                    <DueDate date={notice} today={today} />
                  </p>
                </li>
              ) : null}
              {end ? (
                <li className="flex gap-3">
                  <Icon
                    name={end < today ? 'checkCircle' : 'calendar'}
                    className={`mt-0.5 size-5 ${end < today ? 'text-muted-foreground' : 'text-info'}`}
                  />
                  <p>
                    <span className="font-medium">{t('contracts.ends')}</span>
                    {' · '}
                    <DueDate date={end} today={today} />
                  </p>
                </li>
              ) : null}
            </ol>
          </Card>
          <Comments table="Contratos" record={contract} />
        </div>
        <div className="space-y-6">
          <Card title={t('contracts.data')}>
            <dl className="space-y-3">
              <Fact term={t('fields.renovacionAutomatica')}>
                {autoRenews ? t('common.yes') : t('common.no')}
              </Fact>
              {dias !== null ? (
                <Fact term={t('fields.diasAvisoPrevio')}>
                  {t('contracts.daysNotice', { count: dias })}
                </Fact>
              ) : null}
              <Fact term={t('fields.responsableId')}>
                {names.user(text(contract, 'responsableId')) || t('matters.unassigned')}
              </Fact>
              <Fact term={t('contracts.document')}>
                {docId ? <DocumentFile docId={docId} /> : t('contracts.documentNone')}
              </Fact>
            </dl>
          </Card>
          <Documents table="Contratos" record={contract} defaultArea="CONTRATOS" />
        </div>
      </div>

      {editing ? (
        <ContractForm
          contract={contract}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirm}
        title={t('contracts.deleteTitle')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          setConfirm(false);
          void engine.mutate('Contratos', 'delete', contract.id).then(() => {
            navigate('/contratos');
          });
        }}
        onClose={() => {
          setConfirm(false);
        }}
      >
        <p>{t('contracts.deleteBody')}</p>
      </ConfirmDialog>
    </>
  );
}
