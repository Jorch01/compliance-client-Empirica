import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  moveToStage,
  parseHistory,
  stageProgress,
  text,
  type Row,
  type Stage,
} from '@empirica/shared';
import { daysBetween, todayInCancun } from '../../domain/deadlines.ts';
import { formatDate } from '../../i18n/index.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { EmptyState } from '../../ui/Card.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { SelectField, TextArea, TextField } from '../../ui/Field.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';

type ItemState = 'done' | 'current' | 'next';

interface Item {
  key: string;
  name: string;
  state: ItemState;
  date: string | null;
  note: string | null;
  dias: number | null;
}

/** The stages behind, the current one and the template's stages ahead, in order. */
function timeline(filing: Row, stages: readonly Stage[]): Item[] {
  const history = parseHistory(filing.historialEtapas);
  const current = text(filing, 'etapaActual');
  const days = (name: string): number | null => stages.find((s) => s.nombre === name)?.dias ?? null;
  const lastCurrent = current ? history.map((e) => e.etapa).lastIndexOf(current) : -1;
  const items: Item[] = history.map((entry, i) => ({
    key: `h${String(i)}`,
    name: entry.etapa,
    state: i === lastCurrent ? 'current' : 'done',
    date: entry.fecha,
    note: entry.nota,
    dias: days(entry.etapa),
  }));
  // The current stage set by hand, without an entry in the history.
  if (current && lastCurrent === -1) {
    items.push({
      key: 'c',
      name: current,
      state: 'current',
      date: null,
      note: null,
      dias: days(current),
    });
  }
  // What remains of the template is still to come; whatever was after the current entry, done.
  const { index } = stageProgress(filing, stages);
  const ahead = current ? (index >= 0 ? stages.slice(index + 1) : []) : stages;
  ahead.forEach((s, i) => {
    items.push({
      key: `n${String(i)}`,
      name: s.nombre,
      state: 'next',
      date: null,
      note: null,
      dias: s.dias,
    });
  });
  return items;
}

const MARK: Record<ItemState, { icon: IconName; className: string }> = {
  done: { icon: 'checkCircle', className: 'text-success' },
  current: { icon: 'arrowRight', className: 'text-info' },
  next: { icon: 'minus', className: 'text-muted-foreground' },
};

/** Moves a filing to a stage of its template or a new one, from a date, with a note. */
function MoveDialog({
  filing,
  stages,
  onClose,
}: {
  filing: Row;
  stages: readonly Stage[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const OTHER = '__other__';
  const next = stageProgress(filing, stages).next;
  const [choice, setChoice] = useState(next?.nombre ?? (stages.length ? '' : OTHER));
  const [other, setOther] = useState('');
  const [fecha, setFecha] = useState(todayInCancun());
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const etapa = choice === OTHER ? other.trim() : choice;
    if (!etapa || !fecha) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      await engine.mutate('Tramites', 'update', filing.id, moveToStage(filing, etapa, fecha, nota));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      error={error}
      title={t('filings.moveTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="move-stage" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="move-stage" className="space-y-4" onSubmit={(e) => void submit(e)}>
        {stages.length ? (
          <SelectField
            label={t('filings.moveStage')}
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
            }}
            options={[
              ...stages.map((s) => ({ value: s.nombre, label: s.nombre })),
              { value: OTHER, label: t('filings.otherStage') },
            ]}
          />
        ) : null}
        {choice === OTHER ? (
          <TextField
            label={t('filings.otherStageName')}
            required
            maxLength={200}
            value={other}
            onChange={(e) => {
              setOther(e.target.value);
            }}
          />
        ) : null}
        <TextField
          type="date"
          label={t('filings.moveDate')}
          required
          value={fecha}
          onChange={(e) => {
            setFecha(e.target.value);
          }}
        />
        <TextArea
          label={t('filings.moveNote')}
          optional={t('common.optional')}
          rows={2}
          maxLength={1000}
          value={nota}
          onChange={(e) => {
            setNota(e.target.value);
          }}
        />
      </form>
    </Dialog>
  );
}

/**
 * Where a filing has been and where it goes: its stages with their dates,
 * the current one with its days, and the template's next ones. The firm
 * moves it on from here.
 */
export function StageTimeline({
  filing,
  stages,
  editable,
}: {
  filing: Row;
  /** The template's stages (the firm's; empty for a client or without a template). */
  stages: readonly Stage[];
  editable: boolean;
}) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const [moving, setMoving] = useState(false);
  const today = todayInCancun();
  const items = timeline(filing, stages);
  const next = stageProgress(filing, stages).next;
  const labels: Record<ItemState, string> = {
    done: t('filings.stageDone'),
    current: t('filings.stageCurrent'),
    next: t('filings.stageNext'),
  };

  return (
    <>
      {items.length === 0 ? (
        <EmptyState icon="list" title={t('filings.stagesEmpty')} />
      ) : (
        <ol className="space-y-3">
          {items.map((item) => (
            <li key={item.key} className="flex gap-3">
              <Icon
                name={MARK[item.state].icon}
                className={`mt-0.5 size-5 shrink-0 ${MARK[item.state].className}`}
              />
              <div className="min-w-0">
                <p className={item.state === 'current' ? 'font-semibold' : ''}>
                  {item.name}
                  <span className="text-sm font-normal text-muted-foreground">
                    {' · '}
                    {labels[item.state]}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {[
                    item.date ? t('filings.since', { date: formatDate(item.date) }) : '',
                    item.state === 'current' && item.date
                      ? t('filings.daysInStage', {
                          count: Math.max(0, daysBetween(item.date, today)),
                        })
                      : '',
                    item.state !== 'done' && item.dias !== null
                      ? t('filings.estimate', { count: item.dias })
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {item.note ? <p className="text-sm whitespace-pre-line">{item.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      {editable ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {next ? (
            <Button
              size="sm"
              icon="arrowRight"
              onClick={() =>
                void engine.mutate(
                  'Tramites',
                  'update',
                  filing.id,
                  moveToStage(filing, next.nombre, today),
                )
              }
            >
              {t('filings.moveNext', { stage: next.nombre })}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            icon="pencil"
            onClick={() => {
              setMoving(true);
            }}
          >
            {t('filings.moveOther')}
          </Button>
        </div>
      ) : null}
      {moving ? (
        <MoveDialog
          filing={filing}
          stages={stages}
          onClose={() => {
            setMoving(false);
          }}
        />
      ) : null}
    </>
  );
}
