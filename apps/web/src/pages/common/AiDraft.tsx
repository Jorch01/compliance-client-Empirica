import { useState, type ReactNode, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import {
  AREAS,
  CATEGORIAS_OBLIGACION,
  LADOS_RESPONSABLE,
  MAX_DRAFT_REQUEST,
  MAX_DRAFT_TITLE,
  draftIssues,
  isEmpty,
  text,
  withoutItem,
  type AiDraftData,
  type DraftItem,
  type DraftRecord,
  type Row,
  type Value,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { todayInCancun } from '../../domain/deadlines.ts';
import { unitTree } from '../../domain/scope.ts';
import { areaLabel, categoryLabel, fieldLabel } from '../../i18n/labels.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { CheckboxField, SelectField, TextArea, TextField } from '../../ui/Field.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { describeRule } from '../compliance/compliance.ts';
import { useTemplates, type Template } from '../filings/filings.ts';
import { aiErrorText } from './ai.ts';
import {
  DRAFT_PATH,
  createDraft,
  draftsForAny,
  eventFields,
  eventParts,
  itemTitle,
  mayDraft,
} from './draft.ts';

const APPOINTMENT_TYPES = ['CITA', 'REUNION', 'AUDIENCIA'] as const;

type ReviewHint =
  | 'aiDraft.reviewDate'
  | 'aiDraft.reviewFatal'
  | 'aiDraft.reviewRule'
  | 'aiDraft.reviewAuthority'
  | 'aiDraft.reviewValue';

/** What the AI's reading of each column asks the lawyer to check (dates: reviewDate). */
const REVIEW_HINT: Partial<Record<string, ReviewHint>> = {
  esFatal: 'aiDraft.reviewFatal',
  recurrencia: 'aiDraft.reviewRule',
  autoridad: 'aiDraft.reviewAuthority',
  diasAvisoPrevio: 'aiDraft.reviewValue',
  renovacionAutomatica: 'aiDraft.reviewValue',
};

const str = (fields: Readonly<Record<string, Value>>, field: string): string => {
  const value = fields[field];
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
};

/**
 * "Crear con IA" (F8, D73): within a matter, "Sugerir tareas con IA". Only
 * the client's SOCIO_ADMIN and ABOGADO see it, where the AI is on.
 */
export function AiDraftButton({ matter }: { matter?: Row }) {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { scope } = useScope();
  const [open, setOpen] = useState(false);
  const clientId = matter ? text(matter, 'clienteId') : scope.clientId;
  const show = matter || clientId ? mayDraft(me, clientId) : draftsForAny(me);
  if (!show) return null;
  return (
    <>
      <Button
        variant="secondary"
        size={matter ? 'sm' : 'md'}
        icon="sparkles"
        onClick={() => {
          setOpen(true);
        }}
      >
        {matter ? t('aiDraft.suggestTasks') : t('aiDraft.open')}
      </Button>
      {open ? (
        <AiDraftDialog
          matter={matter}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

type Step = 'ask' | 'review' | 'done';

/**
 * Ask, review, create (PLAN.md § 24): the lawyer describes what they need,
 * corrects what the AI proposes and creates it with one click, on the
 * device and as theirs. Everything is born internal (D75).
 */
function AiDraftDialog({ matter, onClose }: { matter?: Row | undefined; onClose: () => void }) {
  const { t } = useTranslation();
  const { me, call, engine } = usePortal();
  const { scope, clients } = useScope();
  const allUnits = useRows('Entidades');
  const allMatters = useRows('Asuntos');
  const allTasks = useRows('Tareas');
  const templates = useTemplates();
  const allowed = clients.filter((c) => mayDraft(me, c.id));
  const [clienteId, setClienteId] = useState(() =>
    matter
      ? (text(matter, 'clienteId') ?? '')
      : scope.clientId && allowed.some((c) => c.id === scope.clientId)
        ? scope.clientId
        : allowed.length === 1
          ? (allowed[0]?.id ?? '')
          : '',
  );
  const [entidadId, setEntidadId] = useState(() => (matter ? '' : (scope.unitId ?? '')));
  const [asuntoId, setAsuntoId] = useState(matter?.id ?? '');
  const [peticion, setPeticion] = useState('');
  const [step, setStep] = useState<Step>('ask');
  const [explicacion, setExplicacion] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [created, setCreated] = useState<{ record: DraftRecord; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const units = unitTree((allUnits ?? []).filter((u) => u.clienteId === clienteId));
  const openMatters = (allMatters ?? []).filter(
    (a) => a.clienteId === clienteId && !a.deleted && a.estado !== 'CONCLUIDO',
  );
  const titleOf = (rows: readonly Row[] | undefined, id: Value | undefined): string =>
    text(rows?.find((r) => r.id === id) ?? { id: '' }, 'titulo') ?? '';
  const problems = items.map((item) => draftIssues(item));
  const blocked = items.length === 0 || problems.some((p) => p.length > 0);

  const propose = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!clienteId) {
      setError(t('requests.chooseClient'));
      return;
    }
    const request = peticion.trim();
    if (request.length < 3) {
      setError(t('aiDraft.requestRequired'));
      return;
    }
    setBusy(true);
    try {
      const { data } = await call<AiDraftData>('ai.draft', {
        clienteId,
        peticion: request,
        ...(entidadId ? { entidadId } : {}),
        ...(asuntoId ? { asuntoId } : {}),
      });
      setExplicacion(data.explicacion);
      setItems(data.items);
      setNotice('');
      setStep('review');
    } catch (e) {
      setError(aiErrorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const create = async (): Promise<void> => {
    setError(null);
    if (blocked) {
      setError(t('aiDraft.fixFirst'));
      return;
    }
    setBusy(true);
    try {
      const titles = new Map(items.map((i) => [i.key, itemTitle(i)]));
      const records = await createDraft(engine, items, { templates, today: todayInCancun() });
      setCreated(records.map((record) => ({ record, title: titles.get(record.key) ?? '' })));
      setStep('done');
    } catch (e) {
      setError(aiErrorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const update = (key: string, fields: Record<string, Value>): void => {
    setItems((list) =>
      list.map((i) => (i.key === key ? { ...i, fields: { ...i.fields, ...fields } } : i)),
    );
  };
  const remove = (item: DraftItem): void => {
    const next = withoutItem(items, item.key);
    const title = itemTitle(item) || t('aiDraft.untitled');
    setNotice(
      next.length < items.length - 1
        ? t('aiDraft.removedWithTasks', { title })
        : t('aiDraft.removed', { title }),
    );
    setItems(next);
  };
  /** Where an item hangs from, in words: its matter, the task it waits for. */
  const linksOf = (item: DraftItem): string[] => {
    const out: string[] = [];
    const inDraft = (key: string | undefined): DraftItem | undefined =>
      key ? items.find((i) => i.key === key) : undefined;
    const matterItem = inDraft(item.links.asuntoId);
    const origin = item.fields.origen;
    const existing =
      typeof item.fields.asuntoId === 'string'
        ? item.fields.asuntoId
        : origin && typeof origin === 'object' && !Array.isArray(origin)
          ? origin.id
          : undefined;
    if (matterItem) out.push(t('aiDraft.inMatter', { title: itemTitle(matterItem) }));
    else if (existing) out.push(t('aiDraft.inMatter', { title: titleOf(allMatters, existing) }));
    const waits = inDraft(item.links.dependeDe);
    if (waits) out.push(t('aiDraft.waitsFor', { title: itemTitle(waits) }));
    else if (typeof item.fields.dependeDe === 'string') {
      out.push(t('aiDraft.waitsFor', { title: titleOf(allTasks, item.fields.dependeDe) }));
    }
    return out;
  };

  const footer =
    step === 'ask' ? (
      <>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          form="ai-draft-form"
          icon="sparkles"
          busy={busy}
          busyLabel={t('aiDraft.proposing')}
        >
          {t('aiDraft.propose')}
        </Button>
      </>
    ) : step === 'review' ? (
      <>
        <Button
          variant="secondary"
          onClick={() => {
            setError(null);
            setStep('ask');
          }}
        >
          {t('aiDraft.back')}
        </Button>
        <Button
          icon="check"
          busy={busy}
          busyLabel={t('aiDraft.creating')}
          disabled={items.length === 0}
          onClick={() => void create()}
        >
          {t('aiDraft.create', { count: items.length })}
        </Button>
      </>
    ) : (
      <Button icon="check" onClick={onClose}>
        {t('aiDraft.done')}
      </Button>
    );

  return (
    <Dialog
      open
      onClose={onClose}
      error={error}
      size="lg"
      title={matter ? t('aiDraft.titleTasks') : t('aiDraft.title')}
      footer={footer}
    >
      {step === 'ask' ? (
        <form id="ai-draft-form" className="space-y-4" onSubmit={(e) => void propose(e)}>
          <p className="text-muted-foreground">{t('aiDraft.intro')}</p>
          {matter ? (
            <p className="rounded-control border border-border bg-muted p-3 text-sm">
              {t('aiDraft.inMatter', { title: text(matter, 'titulo') ?? '' })}
            </p>
          ) : (
            <>
              {allowed.length > 1 ? (
                <SelectField
                  label={t('shell.client')}
                  value={clienteId}
                  onChange={(e) => {
                    setClienteId(e.target.value);
                    setEntidadId('');
                    setAsuntoId('');
                  }}
                  options={[
                    { value: '', label: t('shell.chooseClient') },
                    ...allowed.map((c) => ({ value: c.id, label: clientName(c) })),
                  ]}
                />
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                {units.length ? (
                  <SelectField
                    label={t('fields.entidadId')}
                    optional={t('common.optional')}
                    value={entidadId}
                    onChange={(e) => {
                      setEntidadId(e.target.value);
                    }}
                    options={[
                      { value: '', label: t('matters.wholeClient') },
                      ...units.map((u) => ({
                        value: u.row.id,
                        label: `${'— '.repeat(u.depth)}${text(u.row, 'nombre') ?? ''}`,
                      })),
                    ]}
                  />
                ) : null}
                {openMatters.length ? (
                  <SelectField
                    label={t('fields.asuntoId')}
                    optional={t('common.optional')}
                    value={asuntoId}
                    onChange={(e) => {
                      setAsuntoId(e.target.value);
                    }}
                    options={[
                      { value: '', label: t('aiDraft.newWork') },
                      ...openMatters.map((a) => ({ value: a.id, label: text(a, 'titulo') ?? '' })),
                    ]}
                  />
                ) : null}
              </div>
            </>
          )}
          <TextArea
            label={t('aiDraft.request')}
            placeholder={
              matter ? t('aiDraft.requestPlaceholderTasks') : t('aiDraft.requestPlaceholder')
            }
            hint={t('aiDraft.privacy')}
            maxLength={MAX_DRAFT_REQUEST}
            rows={5}
            value={peticion}
            onChange={(e) => {
              setPeticion(e.target.value);
            }}
          />
        </form>
      ) : step === 'review' ? (
        <div className="space-y-4">
          {explicacion ? (
            <div className="rounded-control border border-border bg-muted p-3">
              <p className="label-caps text-muted-foreground">{t('aiDraft.proposal')}</p>
              <p className="mt-1">{explicacion}</p>
            </div>
          ) : null}
          <p className="flex items-start gap-2 text-sm">
            <Icon name="lock" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              {t('aiDraft.internalNotice')} {t('aiDraft.reviewIntro')}
            </span>
          </p>
          <p role="status" className="text-sm text-muted-foreground empty:hidden">
            {notice}
          </p>
          {items.length === 0 ? (
            <p className="rounded-control border border-border p-3">{t('aiDraft.empty')}</p>
          ) : (
            <ol className="space-y-3">
              {items.map((item, i) => (
                <li key={item.key}>
                  <ItemCard
                    item={item}
                    problems={problems[i] ?? []}
                    links={linksOf(item)}
                    templates={templates}
                    me={me.id}
                    onChange={(fields) => {
                      update(item.key, fields);
                    }}
                    onRemove={() => {
                      remove(item);
                    }}
                  />
                </li>
              ))}
            </ol>
          )}
          {blocked && items.length ? (
            <p className="text-sm font-medium text-danger-subtle-foreground">
              {t('aiDraft.fixFirst')}
            </p>
          ) : null}
        </div>
      ) : (
        <div role="status" className="space-y-3">
          <p className="flex items-center gap-2 font-medium">
            <Icon name="check" className="size-5 text-success" />
            {t('aiDraft.created', { count: created.length })}
          </p>
          <p className="text-sm text-muted-foreground">{t('aiDraft.createdHint')}</p>
          <ul className="space-y-1">
            {created.map(({ record, title }) => (
              <li key={record.id}>
                <Link
                  href={`${DRAFT_PATH[record.table]}/${record.id}`}
                  onClick={onClose}
                  className="text-link underline-offset-2 hover:underline"
                >
                  {t(`aiDraft.kinds.${record.table}`)}: {title || t('aiDraft.untitled')}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}

/** One proposed record: its main columns to correct, where it hangs from, share or remove it. */
function ItemCard({
  item,
  problems,
  links,
  templates,
  me,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  problems: readonly string[];
  links: readonly string[];
  templates: ReadonlyMap<string, Template>;
  me: string;
  onChange: (fields: Record<string, Value>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const f = item.fields;
  const title = itemTitle(item);
  const error = (field: string): string | null =>
    problems.includes(field)
      ? isEmpty(f[field])
        ? t('aiDraft.missing')
        : t('aiDraft.invalid')
      : null;
  const hint = (field: string): string | undefined =>
    item.review.includes(field) ? t(REVIEW_HINT[field] ?? 'aiDraft.reviewDate') : undefined;
  const setText =
    (field: string) =>
    (event: { target: { value: string } }): void => {
      onChange({ [field]: event.target.value === '' ? null : event.target.value });
    };
  const textField = (field: string, label = fieldLabel(t, field), extra?: string): ReactNode => (
    <TextField
      label={label}
      required
      maxLength={MAX_DRAFT_TITLE}
      value={str(f, field)}
      onChange={setText(field)}
      error={error(field)}
      hint={extra}
    />
  );
  const dateField = (field: string): ReactNode => (
    <TextField
      type="date"
      label={fieldLabel(t, field)}
      optional={t('common.optional')}
      value={str(f, field).slice(0, 10)}
      onChange={setText(field)}
      error={error(field)}
      hint={hint(field)}
    />
  );
  const shown = new Set<string>();
  const note = (field: string): void => {
    shown.add(field);
  };

  let editor: ReactNode;
  switch (item.table) {
    case 'Asuntos':
      ['titulo', 'area', 'fechaInicio', 'fechaObjetivo'].forEach(note);
      editor = (
        <>
          {textField('titulo')}
          <SelectField
            label={fieldLabel(t, 'area')}
            required
            value={str(f, 'area')}
            onChange={setText('area')}
            error={error('area')}
            options={[
              { value: '', label: t('matters.chooseArea') },
              ...AREAS.map((a) => ({ value: a, label: areaLabel(t, a) })),
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {dateField('fechaInicio')}
            {dateField('fechaObjetivo')}
          </div>
        </>
      );
      break;

    case 'Tareas': {
      ['titulo', 'ladoResponsable', 'fechaLimite', 'esFatal'].forEach(note);
      const points = Array.isArray(f.checklist)
        ? f.checklist.flatMap((p) =>
            p && typeof p === 'object' && !Array.isArray(p) && typeof p.texto === 'string'
              ? [p.texto]
              : [],
          )
        : [];
      editor = (
        <>
          {textField('titulo')}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('tasks.side')}
              value={str(f, 'ladoResponsable')}
              onChange={(e) => {
                const side = e.target.value;
                onChange({
                  ladoResponsable: side,
                  responsableId:
                    side === 'EMPIRICA'
                      ? me
                      : side === 'CLIENTE'
                        ? null
                        : (f.responsableId ?? null),
                });
              }}
              error={error('ladoResponsable')}
              options={LADOS_RESPONSABLE.map((l) => ({ value: l, label: t(`tasks.lados.${l}`) }))}
            />
            {dateField('fechaLimite')}
          </div>
          <CheckboxField
            label={fieldLabel(t, 'esFatal')}
            hint={hint('esFatal')}
            checked={f.esFatal === true}
            onChange={(e) => {
              onChange({ esFatal: e.target.checked });
            }}
          />
          {points.length ? (
            <p className="text-sm text-muted-foreground">
              {t('aiDraft.steps', { list: points.join(' · ') })}
            </p>
          ) : null}
        </>
      );
      break;
    }

    case 'Tramites':
      ['titulo', 'plantillaId', 'autoridad', 'fechaPresentacion', 'fechaLimite'].forEach(note);
      editor = (
        <>
          {textField('titulo')}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={fieldLabel(t, 'plantillaId')}
              optional={t('common.optional')}
              value={str(f, 'plantillaId')}
              onChange={(e) => {
                const id = e.target.value;
                const authority = text(templates.get(id)?.row ?? { id: '' }, 'autoridad');
                onChange({
                  plantillaId: id || null,
                  ...(id && authority && !str(f, 'autoridad') ? { autoridad: authority } : {}),
                });
              }}
              error={error('plantillaId')}
              options={[
                { value: '', label: t('aiDraft.noTemplate') },
                ...[...templates.values()].map((tp) => ({
                  value: tp.row.id,
                  label: text(tp.row, 'nombre') ?? '',
                })),
              ]}
            />
            <TextField
              label={fieldLabel(t, 'autoridad')}
              optional={t('common.optional')}
              maxLength={MAX_DRAFT_TITLE}
              value={str(f, 'autoridad')}
              onChange={setText('autoridad')}
              hint={hint('autoridad')}
            />
            {dateField('fechaPresentacion')}
            {dateField('fechaLimite')}
          </div>
        </>
      );
      break;

    case 'Obligaciones':
      ['nombre', 'categoria', 'proximoVencimiento', 'recurrencia', 'autoridad'].forEach(note);
      editor = (
        <>
          {textField(
            'nombre',
            fieldLabel(t, 'nombre'),
            item.source ? t('aiDraft.fromCatalog') : t('aiDraft.draftObligation'),
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={fieldLabel(t, 'categoria')}
              required
              value={str(f, 'categoria')}
              onChange={setText('categoria')}
              error={error('categoria')}
              options={[
                { value: '', label: t('aiDraft.chooseCategory') },
                ...CATEGORIAS_OBLIGACION.map((c) => ({ value: c, label: categoryLabel(t, c) })),
              ]}
            />
            {dateField('proximoVencimiento')}
          </div>
          <p className="text-sm">
            <span className="font-medium">{fieldLabel(t, 'recurrencia')}:</span>{' '}
            {describeRule(t, typeof f.recurrencia === 'string' ? f.recurrencia : null)}
            {hint('recurrencia') ? (
              <span className="block text-muted-foreground">{hint('recurrencia')}</span>
            ) : null}
          </p>
          {str(f, 'autoridad') ? (
            <p className="text-sm">
              <span className="font-medium">{fieldLabel(t, 'autoridad')}:</span>{' '}
              {str(f, 'autoridad')}
              {hint('autoridad') ? (
                <span className="block text-muted-foreground">{hint('autoridad')}</span>
              ) : null}
            </p>
          ) : null}
        </>
      );
      break;

    case 'Contratos':
      [
        'contraparte',
        'tipo',
        'fechaFirma',
        'vigenciaHasta',
        'diasAvisoPrevio',
        'renovacionAutomatica',
      ].forEach(note);
      editor = (
        <>
          {textField('contraparte', fieldLabel(t, 'contraparte'), t('aiDraft.counterpartyHint'))}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={fieldLabel(t, 'tipo')}
              optional={t('common.optional')}
              maxLength={120}
              value={str(f, 'tipo')}
              onChange={setText('tipo')}
            />
            <TextField
              type="number"
              min={0}
              max={365}
              label={fieldLabel(t, 'diasAvisoPrevio')}
              optional={t('common.optional')}
              value={str(f, 'diasAvisoPrevio')}
              onChange={(e) => {
                const n = Number(e.target.value);
                onChange({
                  diasAvisoPrevio:
                    e.target.value === '' || !Number.isInteger(n) || n < 0 ? null : n,
                });
              }}
              error={error('diasAvisoPrevio')}
              hint={hint('diasAvisoPrevio')}
            />
            {dateField('fechaFirma')}
            {dateField('vigenciaHasta')}
          </div>
          <CheckboxField
            label={fieldLabel(t, 'renovacionAutomatica')}
            hint={hint('renovacionAutomatica')}
            checked={f.renovacionAutomatica === true}
            onChange={(e) => {
              onChange({ renovacionAutomatica: e.target.checked });
            }}
          />
        </>
      );
      break;

    case 'Eventos': {
      ['titulo', 'tipo', 'inicio', 'fin', 'todoElDia'].forEach(note);
      const parts = eventParts(f);
      const setParts = (patch: Partial<typeof parts>): void => {
        onChange(eventFields({ ...parts, ...patch }));
      };
      editor = (
        <>
          {textField('titulo')}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('aiDraft.appointmentType')}
              value={str(f, 'tipo')}
              onChange={setText('tipo')}
              error={error('tipo')}
              options={APPOINTMENT_TYPES.map((x) => ({ value: x, label: t(`agenda.types.${x}`) }))}
            />
            <TextField
              type="date"
              label={t('aiDraft.day')}
              required
              value={parts.day}
              onChange={(e) => {
                setParts({ day: e.target.value });
              }}
              error={error('inicio')}
              hint={hint('inicio')}
            />
          </div>
          <CheckboxField
            label={t('agenda.allDay')}
            checked={parts.allDay}
            onChange={(e) => {
              setParts({ allDay: e.target.checked });
            }}
          />
          {parts.allDay ? null : (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                type="time"
                label={t('agenda.start')}
                value={parts.start}
                onChange={(e) => {
                  setParts({ start: e.target.value });
                }}
              />
              <TextField
                type="time"
                label={t('agenda.end')}
                value={parts.end}
                onChange={(e) => {
                  setParts({ end: e.target.value });
                }}
                error={error('fin') ? t('agenda.endAfterStart') : null}
              />
            </div>
          )}
        </>
      );
      break;
    }
  }
  // A problem in a column the card does not show (it should not happen): said in one line.
  const hidden = problems.filter((p) => !shown.has(p));

  return (
    <fieldset className="space-y-3 rounded-control border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{t(`aiDraft.kinds.${item.table}`)}</legend>
      {editor}
      {links.map((line) => (
        <p key={line} className="text-sm text-muted-foreground">
          {line}
        </p>
      ))}
      {item.table === 'Tramites' && item.source ? (
        <p className="text-sm text-muted-foreground">{t('aiDraft.fromTemplate')}</p>
      ) : null}
      {hidden.length ? (
        <p className="text-sm font-medium text-danger-subtle-foreground">
          {t('aiDraft.hiddenProblem', { fields: hidden.map((h) => fieldLabel(t, h)).join(', ') })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <CheckboxField
          label={t('aiDraft.share')}
          checked={f.visibilidad === 'COMPARTIDO'}
          onChange={(e) => {
            onChange({ visibilidad: e.target.checked ? 'COMPARTIDO' : 'INTERNO' });
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          icon="x"
          aria-label={t('aiDraft.remove', { title: title || t('aiDraft.untitled') })}
          onClick={onRemove}
        >
          {t('aiDraft.removeShort')}
        </Button>
      </div>
    </fieldset>
  );
}
