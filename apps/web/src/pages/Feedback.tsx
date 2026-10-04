import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ESTADOS_SUGERENCIA, text, type Row } from '@empirica/shared';
import { usePendingIds, useRows } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { useFeedback } from '../feedback/context.ts';
import { DetailsBlock } from '../feedback/DetailsBlock.tsx';
import { recordError } from '../feedback/diagnostics.ts';
import { formatDateTime } from '../i18n/index.ts';
import { oneOf } from '../i18n/labels.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { SelectField, TextArea } from '../ui/Field.tsx';
import { Icon } from '../ui/Icon.tsx';
import { StatusBadge, type Tone } from '../ui/StatusBadge.tsx';

type Estado = (typeof ESTADOS_SUGERENCIA)[number];

const TONE: Record<Estado, Tone> = {
  NUEVA: 'info',
  EN_REVISION: 'warning',
  RESUELTA: 'success',
  DESCARTADA: 'neutral',
};

const estadoOf = (row: Row): Estado =>
  oneOf(ESTADOS_SUGERENCIA, row.estado) ? row.estado : 'NUEVA';

/**
 * The administrators' answer: status and a reply its author will read,
 * saved together (so it does not leave the "open" list half answered).
 */
function Answer({ row }: { row: Row }) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const [estado, setEstado] = useState<Estado>(estadoOf(row));
  const [reply, setReply] = useState(text(row, 'respuesta') ?? '');
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');
  const save = async (): Promise<void> => {
    setState('busy');
    try {
      await engine.mutate('Sugerencias', 'update', row.id, {
        estado,
        respuesta: reply.trim() || null,
      });
      setState('saved');
    } catch (e) {
      recordError(e, 'feedback.answer');
      setState('failed');
    }
  };
  return (
    <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-[12rem_1fr]">
      <SelectField
        label={t('feedback.status')}
        value={estado}
        options={ESTADOS_SUGERENCIA.map((s) => ({ value: s, label: t(`feedback.estados.${s}`) }))}
        onChange={(e) => {
          if (oneOf(ESTADOS_SUGERENCIA, e.target.value)) setEstado(e.target.value);
          setState('idle');
        }}
      />
      <TextArea
        label={t('feedback.replyLabel')}
        hint={t('feedback.replyHint')}
        rows={2}
        maxLength={5000}
        value={reply}
        onChange={(e) => {
          setReply(e.target.value);
          setState('idle');
        }}
      />
      <div className="flex items-center gap-3 sm:col-start-2">
        <Button size="sm" variant="secondary" busy={state === 'busy'} onClick={() => void save()}>
          {t('feedback.save')}
        </Button>
        {state === 'saved' || state === 'failed' ? (
          <span role="status" className="text-sm text-muted-foreground">
            {state === 'saved' ? t('feedback.saved') : t('errors.UNKNOWN')}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function FeedbackItem({ row, admin }: { row: Row; admin: boolean }) {
  const { t } = useTranslation();
  const names = useNames();
  const pending = usePendingIds('Sugerencias');
  const [open, setOpen] = useState(false);
  const estado = estadoOf(row);
  const reply = text(row, 'respuesta');
  const detail = row.diagnostico;
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Icon
              name={row.tipo === 'ERROR' ? 'alert' : 'message'}
              className="size-4 text-muted-foreground"
            />
            {t(`feedback.kinds.${row.tipo === 'ERROR' ? 'ERROR' : 'SUGERENCIA'}`)}
          </p>
          <p className="mt-1 whitespace-pre-line">{text(row, 'mensaje')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {[
              admin ? t('feedback.from', { name: names.user(text(row, 'usuarioId')) || '—' }) : '',
              admin && text(row, 'clienteContexto')
                ? names.client(text(row, 'clienteContexto'))
                : '',
              formatDateTime(text(row, 'createdAt')),
              text(row, 'pantalla') ?? '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {pending.has(row.id) ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="cloudOff" className="size-3.5" />
              {t('common.pendingSync')}
            </p>
          ) : null}
        </div>
        <StatusBadge tone={TONE[estado]}>{t(`feedback.estados.${estado}`)}</StatusBadge>
      </div>
      {reply && !admin ? (
        <div className="mt-3 rounded-control border-l-4 border-accent-strong bg-accent px-3 py-2 text-accent-foreground">
          <p className="label-caps">{t('feedback.reply')}</p>
          <p className="mt-1 whitespace-pre-line">{reply}</p>
        </div>
      ) : null}
      {admin && detail && typeof detail === 'object' ? (
        <div className="mt-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              setOpen((v) => !v);
            }}
            className="inline-flex items-center gap-1 text-sm text-link underline-offset-2 hover:underline"
          >
            <Icon
              name="chevronRight"
              className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`}
            />
            {t('feedback.technical')}
          </button>
          {open ? <DetailsBlock value={detail} /> : null}
        </div>
      ) : null}
      {admin ? <Answer row={row} /> : null}
    </li>
  );
}

/**
 * "Sugerencias y errores". Everyone sees what they sent and the firm's
 * answer; the administrators see everything and answer it.
 */
export function FeedbackPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { open } = useFeedback();
  const rows = useRows('Sugerencias');
  const [view, setView] = useState<'open' | 'all' | 'mine'>(me.isAdmin ? 'open' : 'mine');
  const shown = useMemo(
    () =>
      (rows ?? [])
        .filter((r) =>
          view === 'mine'
            ? r.usuarioId === me.id
            : view === 'open'
              ? r.estado === 'NUEVA' || r.estado === 'EN_REVISION'
              : true,
        )
        .sort((a, b) => (text(b, 'createdAt') ?? '').localeCompare(text(a, 'createdAt') ?? '')),
    [rows, view, me.id],
  );
  const views = me.isAdmin ? (['open', 'all', 'mine'] as const) : (['mine'] as const);

  return (
    <>
      <PageHeader
        title={t('feedback.pageTitle')}
        actions={
          <Button
            icon="message"
            onClick={() => {
              open();
            }}
          >
            {t('feedback.button')}
          </Button>
        }
      >
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {me.isAdmin ? t('feedback.pageIntroAdmin') : t('feedback.pageIntro')}
        </p>
      </PageHeader>
      <Card>
        {views.length > 1 ? (
          <div role="group" aria-label={t('requests.filter')} className="mb-2 flex flex-wrap gap-2">
            {views.map((v) => (
              <Button
                key={v}
                size="sm"
                variant={view === v ? 'primary' : 'secondary'}
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                }}
              >
                {t(`feedback.views.${v}`)}
              </Button>
            ))}
          </div>
        ) : null}
        {shown.length === 0 ? (
          <EmptyState
            icon="message"
            title={view === 'mine' ? t('feedback.emptyMine') : t('feedback.empty')}
          />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((row) => (
              <FeedbackItem key={row.id} row={row} admin={me.isAdmin && view !== 'mine'} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
