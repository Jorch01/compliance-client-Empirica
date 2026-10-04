import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CATEGORIAS_OBLIGACION,
  LADOS_RESPONSABLE,
  RIESGOS,
  TABLES,
  changedFields,
  dateParts,
  occurrencesBetween,
  parseRecurrence,
  text,
  validateFields,
  type Row,
  type Value,
  type Visibilidad,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { can } from '../../domain/access.ts';
import { todayInCancun } from '../../domain/deadlines.ts';
import { unitTree } from '../../domain/scope.ts';
import { formatDate } from '../../i18n/index.ts';
import { categoryLabel, riskLabel } from '../../i18n/labels.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { CheckboxField, SelectField, TextArea, TextField } from '../../ui/Field.tsx';
import { VisibilityField } from '../common/VisibilityField.tsx';
import { nextDates } from './compliance.ts';
import { RecurrenceField } from './RecurrenceField.tsx';

interface Form {
  clienteId: string;
  entidadId: string;
  categoria: string;
  nombre: string;
  fundamento: string;
  autoridad: string;
  recurrencia: string | null;
  proximoVencimiento: string;
  ladoResponsable: string;
  evidenciaRequerida: string;
  riesgo: string;
  recorreSiInhabil: boolean;
  activa: boolean;
  visibilidad: Visibilidad;
}

const str = (row: Row | undefined, field: string): string => (row ? (text(row, field) ?? '') : '');

/** What a catalog model or an obligation brings to the form. */
const fromModel = (row: Row | undefined) => ({
  categoria: str(row, 'categoria'),
  nombre: str(row, 'nombre'),
  fundamento: str(row, 'fundamento'),
  autoridad: str(row, 'autoridad'),
  recurrencia: row ? text(row, 'recurrencia') : null,
  evidenciaRequerida: str(row, 'evidenciaRequerida'),
  riesgo: str(row, 'riesgo'),
});

/** Whether a date is one of the rule's (an off-rule date still counts, once). */
function onRule(rule: string | null, date: string): boolean {
  const r = parseRecurrence(rule);
  return !r || occurrencesBetween(r, date, date, date).length === 1;
}

/**
 * An obligation, new or edited (firm), optionally from a catalog model.
 * Its rule says how it repeats and `proximoVencimiento` which period is due
 * next; the legal basis is the firm's to write. Saved on the device at once.
 */
export function ObligationForm({
  obligation,
  preset,
  onClose,
  onSaved,
}: {
  obligation?: Row;
  /** A catalog model to start from. */
  preset?: Row;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope, clients } = useScope();
  const allUnits = useRows('Entidades');
  const catalog = useRows('CatalogoObligaciones');
  const creatable = clients.filter((c) => can(me, 'Obligaciones', 'create', c.id));
  const today = todayInCancun();
  const [form, setForm] = useState<Form>(() => ({
    clienteId:
      str(obligation, 'clienteId') ||
      (scope.clientId && creatable.some((c) => c.id === scope.clientId) ? scope.clientId : '') ||
      (creatable.length === 1 ? (creatable[0]?.id ?? '') : ''),
    entidadId: obligation ? str(obligation, 'entidadId') : (scope.unitId ?? ''),
    ...fromModel(obligation ?? preset),
    proximoVencimiento: str(obligation, 'proximoVencimiento'),
    ladoResponsable: str(obligation, 'ladoResponsable'),
    recorreSiInhabil: obligation ? obligation.recorreSiInhabil === true : true,
    activa: obligation ? obligation.estado !== 'INACTIVA' : true,
    visibilidad: obligation?.visibilidad === 'INTERNO' ? 'INTERNO' : 'COMPARTIDO',
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => {
    setForm((f) => ({ ...f, [key]: value }));
  };
  const units = unitTree((allUnits ?? []).filter((u) => u.clienteId === form.clienteId));
  // The rule's first date from today: a ready answer for the next due date.
  const suggestion = nextDates(form.recurrencia, form.proximoVencimiento || today, today, 1)[0];
  const offRule =
    Boolean(form.proximoVencimiento) && !onRule(form.recurrencia, form.proximoVencimiento);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!form.clienteId) {
      setError(t('requests.chooseClient'));
      return;
    }
    const fields: Record<string, Value> = {
      clienteId: form.clienteId,
      entidadId: form.entidadId || null,
      categoria: form.categoria || null,
      nombre: form.nombre.trim(),
      fundamento: form.fundamento.trim() || null,
      autoridad: form.autoridad.trim() || null,
      recurrencia: form.recurrencia,
      proximoVencimiento: form.proximoVencimiento || null,
      ladoResponsable: form.ladoResponsable || null,
      evidenciaRequerida: form.evidenciaRequerida.trim() || null,
      riesgo: form.riesgo || null,
      recorreSiInhabil: form.recorreSiInhabil,
      estado: form.activa ? 'ACTIVA' : 'INACTIVA',
      visibilidad: form.visibilidad,
    };
    const check = validateFields(TABLES.Obligaciones, fields);
    if (!check.ok || !form.nombre.trim() || !form.categoria) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (obligation) {
        const { clienteId: _fixed, ...changes } = changedFields(obligation, check.fields);
        if (Object.keys(changes).length) {
          await engine.mutate('Obligaciones', 'update', obligation.id, changes);
        }
        onClose();
      } else {
        const id = crypto.randomUUID();
        await engine.mutate('Obligaciones', 'create', id, check.fields);
        onClose();
        onSaved?.(id);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      error={error}
      size="lg"
      title={obligation ? t('compliance.edit') : t('compliance.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="obligation-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="obligation-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        {obligation ? null : creatable.length > 1 ? (
          <SelectField
            label={t('shell.client')}
            value={form.clienteId}
            onChange={(e) => {
              setForm((f) => ({ ...f, clienteId: e.target.value, entidadId: '' }));
            }}
            options={[
              { value: '', label: t('shell.chooseClient') },
              ...creatable.map((c) => ({ value: c.id, label: clientName(c) })),
            ]}
          />
        ) : null}
        {obligation || preset || !(catalog ?? []).length ? null : (
          <SelectField
            label={t('compliance.fromCatalog')}
            optional={t('common.optional')}
            value=""
            onChange={(e) => {
              const model = (catalog ?? []).find((c) => c.id === e.target.value);
              if (model) setForm((f) => ({ ...f, ...fromModel(model) }));
            }}
            options={[
              { value: '', label: t('compliance.fromCatalogNone') },
              ...(catalog ?? []).map((c) => ({
                value: c.id,
                label: `${categoryLabel(t, c.categoria)} · ${text(c, 'nombre') ?? ''}`,
              })),
            ]}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('fields.categoria')}
            required
            value={form.categoria}
            onChange={(e) => {
              set('categoria', e.target.value);
            }}
            options={[
              { value: '', label: t('compliance.anyCategory') },
              ...CATEGORIAS_OBLIGACION.map((c) => ({ value: c, label: categoryLabel(t, c) })),
            ]}
          />
          {units.length ? (
            <SelectField
              label={t('fields.entidadId')}
              optional={t('common.optional')}
              value={form.entidadId}
              onChange={(e) => {
                set('entidadId', e.target.value);
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
        </div>
        <TextField
          label={t('fields.nombre')}
          required
          maxLength={300}
          value={form.nombre}
          onChange={(e) => {
            set('nombre', e.target.value);
          }}
        />
        <TextArea
          label={t('fields.fundamento')}
          optional={t('common.optional')}
          hint={t('compliance.fundamentoHint')}
          rows={2}
          maxLength={5000}
          value={form.fundamento}
          onChange={(e) => {
            set('fundamento', e.target.value);
          }}
        />
        <TextField
          label={t('fields.autoridad')}
          optional={t('common.optional')}
          maxLength={200}
          value={form.autoridad}
          onChange={(e) => {
            set('autoridad', e.target.value);
          }}
        />
        <RecurrenceField
          value={form.recurrencia}
          onChange={(rule) => {
            set('recurrencia', rule);
          }}
          anchor={form.proximoVencimiento || (suggestion ?? today)}
          defaultDay={dateParts(form.proximoVencimiento || today)?.d ?? 1}
        />
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <TextField
              type="date"
              label={t('compliance.nextDue')}
              hint={t('compliance.nextDueHint')}
              value={form.proximoVencimiento}
              onChange={(e) => {
                set('proximoVencimiento', e.target.value);
              }}
            />
            {suggestion && suggestion !== form.proximoVencimiento ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  set('proximoVencimiento', suggestion);
                }}
              >
                {t('compliance.nextDueSuggest', { date: formatDate(suggestion) })}
              </Button>
            ) : null}
            {offRule ? (
              <p className="text-sm text-warning-subtle-foreground">{t('compliance.offRule')}</p>
            ) : null}
          </div>
          <SelectField
            label={t('fields.ladoResponsable')}
            optional={t('common.optional')}
            value={form.ladoResponsable}
            onChange={(e) => {
              set('ladoResponsable', e.target.value);
            }}
            options={[
              { value: '', label: t('common.none') },
              ...LADOS_RESPONSABLE.map((l) => ({ value: l, label: t(`tasks.lados.${l}`) })),
            ]}
          />
        </div>
        <CheckboxField
          label={t('fields.recorreSiInhabil')}
          checked={form.recorreSiInhabil}
          onChange={(e) => {
            set('recorreSiInhabil', e.target.checked);
          }}
        />
        <TextArea
          label={t('fields.evidenciaRequerida')}
          optional={t('common.optional')}
          rows={2}
          maxLength={2000}
          value={form.evidenciaRequerida}
          onChange={(e) => {
            set('evidenciaRequerida', e.target.value);
          }}
        />
        <SelectField
          label={t('fields.riesgo')}
          optional={t('common.optional')}
          value={form.riesgo}
          onChange={(e) => {
            set('riesgo', e.target.value);
          }}
          options={[
            { value: '', label: t('common.none') },
            ...RIESGOS.map((r) => ({ value: r, label: riskLabel(t, r) })),
          ]}
        />
        {obligation ? (
          <CheckboxField
            label={t('compliance.active')}
            hint={t('compliance.activeHint')}
            checked={form.activa}
            onChange={(e) => {
              set('activa', e.target.checked);
            }}
          />
        ) : null}
        <VisibilityField
          value={form.visibilidad}
          onChange={(v) => {
            set('visibilidad', v);
          }}
          hint={t('compliance.visibilityHint')}
        />
      </form>
    </Dialog>
  );
}
