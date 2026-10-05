import { useMemo, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  POLICIES,
  TABLES,
  text,
  validateFields,
  type Row,
  type TableName,
  type Value,
  type Visibilidad,
} from '@empirica/shared';
import { usePendingIds, useRows } from '../../data/hooks.ts';
import { useNames } from '../../data/names.ts';
import { can, roleIn } from '../../domain/access.ts';
import { formatDateTime } from '../../i18n/index.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Card, EmptyState } from '../../ui/Card.tsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.tsx';
import { TextArea } from '../../ui/Field.tsx';
import { FilterButtons } from '../../ui/FilterButtons.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { aiErrorText } from './ai.ts';

/** A record's unit, as its comments copy it (`Comentarios.unidadId`). */
const unitOfRecord = (record: Row): string | null => text(record, 'entidadId');

function CommentItem({
  comment,
  pending,
  clientId,
}: {
  comment: Row;
  pending: boolean;
  clientId: string;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const names = useNames();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text(comment, 'texto') ?? '');
  const [confirm, setConfirm] = useState(false);
  const rol = roleIn(me, clientId);
  const policy = rol ? POLICIES.Comentarios[rol] : null;
  const own = comment.autorId === me.id;
  const mayEdit = policy ? policy.update === 'all' || (own && policy.update !== false) : false;
  const mayDelete = policy ? policy.delete === 'all' || (own && policy.delete === 'own') : false;
  const edited =
    Date.parse(text(comment, 'updatedAt') ?? '') - Date.parse(text(comment, 'createdAt') ?? '') >
    60_000;

  const save = async (): Promise<void> => {
    const value = draft.trim();
    if (!value) return;
    await engine.mutate('Comentarios', 'update', comment.id, { texto: value });
    setEditing(false);
  };

  return (
    <li className="py-3">
      <p className="text-sm">
        <span className="font-semibold">{names.user(text(comment, 'autorId')) || '—'}</span>
        <span className="text-muted-foreground">
          {' · '}
          {formatDateTime(text(comment, 'createdAt'))}
          {edited ? ` · ${t('comments.edited')}` : ''}
        </span>
      </p>
      {editing ? (
        <div className="mt-2 space-y-2">
          <TextArea
            label={t('comments.editLabel')}
            rows={3}
            maxLength={5000}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" icon="check" onClick={() => void save()}>
              {t('common.save')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditing(false);
                setDraft(text(comment, 'texto') ?? '');
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-line">{text(comment, 'texto')}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {pending ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name="cloudOff" className="size-3.5" />
            {t('common.pendingSync')}
          </span>
        ) : null}
        {mayEdit && !editing ? (
          <button
            type="button"
            className="text-sm text-link underline-offset-2 hover:underline"
            onClick={() => {
              setDraft(text(comment, 'texto') ?? '');
              setEditing(true);
            }}
          >
            {t('common.edit')}
          </button>
        ) : null}
        {mayDelete && !editing ? (
          <button
            type="button"
            className="text-sm text-link underline-offset-2 hover:underline"
            onClick={() => {
              setConfirm(true);
            }}
          >
            {t('common.delete')}
          </button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm}
        title={t('comments.deleteTitle')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          void engine.mutate('Comentarios', 'delete', comment.id);
          setConfirm(false);
        }}
        onClose={() => {
          setConfirm(false);
        }}
      >
        <p>{t('comments.deleteBody')}</p>
      </ConfirmDialog>
    </li>
  );
}

/**
 * The conversation about a matter or a task. The firm keeps two: with the
 * client, and internal (D19: what the firm writes starts internal). A
 * client user sees and writes only the shared one.
 */
export function Comments({
  table,
  record,
  reminder,
}: {
  table: TableName;
  record: Row;
  /**
   * The firm asks the AI for a reminder to the client (F6): the draft goes
   * into the box of the shared conversation, never posted on its own.
   */
  reminder?: () => Promise<string>;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const [drafting, setDrafting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const clientId = text(record, 'clienteId') ?? '';
  const all = useRows('Comentarios', clientId);
  const pending = usePendingIds('Comentarios');
  const [view, setView] = useState<Visibilidad>(me.isFirm ? 'INTERNO' : 'COMPARTIDO');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const canWrite = can(me, 'Comentarios', 'create', clientId);

  const comments = useMemo(
    () =>
      (all ?? [])
        .filter(
          (c) =>
            c.tipoEntidad === table &&
            c.entidadId === record.id &&
            (!me.isFirm || c.visibilidad === view),
        )
        .sort((a, b) => (text(a, 'createdAt') ?? '').localeCompare(text(b, 'createdAt') ?? '')),
    [all, table, record.id, me.isFirm, view],
  );
  const counts = useMemo(() => {
    const mine = (all ?? []).filter((c) => c.tipoEntidad === table && c.entidadId === record.id);
    return {
      INTERNO: mine.filter((c) => c.visibilidad === 'INTERNO').length,
      COMPARTIDO: mine.filter((c) => c.visibilidad === 'COMPARTIDO').length,
    };
  }, [all, table, record.id]);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    const fields: Record<string, Value> = {
      tipoEntidad: table,
      entidadId: record.id,
      clienteId: clientId,
      unidadId: unitOfRecord(record),
      autorId: me.id,
      texto: value,
      visibilidad: me.isFirm ? view : 'COMPARTIDO',
    };
    const check = validateFields(TABLES.Comentarios, fields);
    if (!check.ok) return;
    // The box empties at once; the text comes back only if saving fails.
    setBusy(true);
    setDraft('');
    try {
      await engine.mutate('Comentarios', 'create', crypto.randomUUID(), check.fields);
    } catch (error) {
      setDraft(value);
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const draftReminder = async (): Promise<void> => {
    if (!reminder) return;
    setView('COMPARTIDO');
    setDrafting(true);
    setAiError(null);
    try {
      const texto = await reminder();
      setDraft((current) => (current.trim() ? `${current.trim()}\n\n${texto}` : texto));
    } catch (error) {
      setAiError(aiErrorText(t, error));
    } finally {
      setDrafting(false);
    }
  };

  const hidden = me.isFirm && view === 'COMPARTIDO' && record.visibilidad === 'INTERNO';
  return (
    <Card title={t('comments.title')}>
      {me.isFirm ? (
        <div className="mb-3">
          <FilterButtons
            label={t('comments.which')}
            value={view}
            onChange={setView}
            options={[
              { value: 'INTERNO', label: t('comments.internal', { n: counts.INTERNO }) },
              { value: 'COMPARTIDO', label: t('comments.shared', { n: counts.COMPARTIDO }) },
            ]}
          />
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon name={view === 'INTERNO' ? 'lock' : 'users'} className="size-4" />
            {hidden
              ? t('comments.internalRecord')
              : view === 'INTERNO'
                ? t('comments.internalHint')
                : t('comments.sharedHint')}
          </p>
        </div>
      ) : null}
      {comments.length === 0 ? (
        <EmptyState icon="message" title={t('comments.empty')} />
      ) : (
        <ul className="divide-y divide-border">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} pending={pending.has(c.id)} clientId={clientId} />
          ))}
        </ul>
      )}
      {canWrite ? (
        <form className="mt-3 space-y-2" onSubmit={(e) => void submit(e)}>
          <TextArea
            label={
              !me.isFirm
                ? t('comments.newClient')
                : view === 'INTERNO'
                  ? t('comments.newInternal')
                  : t('comments.newShared')
            }
            rows={3}
            maxLength={5000}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" icon="send" busy={busy} disabled={!draft.trim()}>
              {t('comments.send')}
            </Button>
            {reminder && me.isFirm ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon="sparkles"
                busy={drafting}
                onClick={() => void draftReminder()}
              >
                {t('ai.reminder')}
              </Button>
            ) : null}
          </div>
          {reminder && me.isFirm ? (
            <p className="text-sm text-muted-foreground">{t('ai.reminderHint')}</p>
          ) : null}
          {aiError ? (
            <p role="alert" className="text-sm font-medium text-danger-subtle-foreground">
              {aiError}
            </p>
          ) : null}
        </form>
      ) : null}
    </Card>
  );
}
