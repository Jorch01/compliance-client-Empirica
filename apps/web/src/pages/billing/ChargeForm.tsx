import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_VAT,
  MONEDAS,
  TABLES,
  addDays,
  amountsOf,
  changedFields,
  text,
  validateFields,
  type Charge,
  type Row,
  type Value,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { todayInCancun } from '../../domain/deadlines.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { SelectField, TextArea, TextField } from '../../ui/Field.tsx';
import { amountText, ensureCharge, formatMoney, parseAmount, useBillingPeople } from './billing.ts';

interface Form {
  clienteId: string;
  concepto: string;
  asuntoId: string;
  fechaEmision: string;
  fechaVencimiento: string;
  subtotal: string;
  moneda: string;
  tasaIVA: string;
  retencionISR: string;
  retencionIVA: string;
  folioFactura: string;
  responsableId: string;
  notas: string;
}

/**
 * A charge, new (one on its own: a job outside the retainer, a success fee)
 * or edited (also a retainer's period, which is then written with the
 * changes). Its split is the partners' (from its page).
 */
export function ChargeForm({
  charge,
  honorarios,
  onClose,
  onSaved,
}: {
  charge?: Charge;
  honorarios: readonly Row[];
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const { scope, clients } = useScope();
  const today = todayInCancun();
  const [form, setForm] = useState<Form>(() => {
    const c = charge;
    const a = c?.amounts;
    const rate = (r: number, base: number): string =>
      base > 0 && r > 0 ? String(Math.round((r / base) * 1_000_000) / 10_000) : '';
    const own = c?.row;
    return {
      clienteId:
        [c?.clienteId, scope.clientId, clients.length === 1 ? clients[0]?.id : null].find(
          Boolean,
        ) ?? '',
      concepto: c?.concepto ?? '',
      asuntoId: c?.asuntoId ?? '',
      fechaEmision: c?.fechaEmision ?? today,
      fechaVencimiento: c?.fechaVencimiento ?? addDays(today, 15),
      subtotal: a ? String(a.subtotal) : '',
      moneda: c?.moneda ?? 'MXN',
      tasaIVA: own ? amountText(own.tasaIVA) : a ? rate(a.iva, a.subtotal) : String(DEFAULT_VAT),
      retencionISR: own ? amountText(own.retencionISR) : a ? rate(a.retencionISR, a.subtotal) : '',
      retencionIVA: own ? amountText(own.retencionIVA) : a ? rate(a.retencionIVA, a.subtotal) : '',
      folioFactura: c?.folioFactura ?? '',
      responsableId: c?.responsableId ?? '',
      notas: own ? (text(own, 'notas') ?? '') : '',
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const people = useBillingPeople(form.clienteId || null);
  const asuntos = useRows('Asuntos', form.clienteId || null);
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => {
    setForm((f) => ({ ...f, [key]: value }));
  };
  const numbers = {
    subtotal: parseAmount(form.subtotal),
    tasaIVA: parseAmount(form.tasaIVA),
    retencionISR: parseAmount(form.retencionISR),
    retencionIVA: parseAmount(form.retencionIVA),
  };
  const num = (n: number | null | 'invalid'): number => (typeof n === 'number' ? n : 0);
  const preview =
    typeof numbers.subtotal === 'number'
      ? amountsOf({
          subtotal: numbers.subtotal,
          tasaIVA: num(numbers.tasaIVA),
          retencionISR: num(numbers.retencionISR),
          retencionIVA: num(numbers.retencionIVA),
        }).total
      : null;

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!form.clienteId) {
      setError(t('requests.chooseClient'));
      return;
    }
    if (Object.values(numbers).includes('invalid') || form.subtotal.trim() === '') {
      setError(t('errors.VALIDATION'));
      return;
    }
    if (form.fechaVencimiento && form.fechaVencimiento < form.fechaEmision) {
      setError(t('billing.form.dueBeforeIssue'));
      return;
    }
    const value = (n: number | null | 'invalid'): Value => (typeof n === 'number' ? n : null);
    const fields: Record<string, Value> = {
      clienteId: form.clienteId,
      concepto: form.concepto.trim(),
      asuntoId: form.asuntoId || null,
      fechaEmision: form.fechaEmision,
      fechaVencimiento: form.fechaVencimiento || null,
      subtotal: value(numbers.subtotal),
      moneda: form.moneda,
      tasaIVA: value(numbers.tasaIVA),
      retencionISR: value(numbers.retencionISR),
      retencionIVA: value(numbers.retencionIVA),
      folioFactura: form.folioFactura.trim() || null,
      responsableId: form.responsableId || null,
      notas: form.notas.trim() || null,
    };
    const check = validateFields(TABLES.Cobros, { ...fields, estado: 'VIGENTE' });
    if (!check.ok || !form.concepto.trim() || !form.fechaEmision) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (charge?.row) {
        const { clienteId: _c, estado: _e, ...changes } = changedFields(charge.row, check.fields);
        if (Object.keys(changes).length) {
          await engine.mutate('Cobros', 'update', charge.id, changes);
        }
        onClose();
      } else if (charge) {
        const { clienteId: _c, estado: _e, ...changes } = check.fields;
        await ensureCharge(engine, charge, honorarios, changes);
        onClose();
      } else {
        const id = crypto.randomUUID();
        await engine.mutate('Cobros', 'create', id, check.fields);
        onClose();
        onSaved?.(id);
      }
    } finally {
      setBusy(false);
    }
  };

  const openMatters = (asuntos ?? []).filter(
    (a) => a.estado !== 'CONCLUIDO' || a.id === form.asuntoId,
  );

  return (
    <Dialog
      open
      onClose={onClose}
      error={error}
      size="lg"
      title={charge ? t('billing.charges.edit') : t('billing.charges.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="charge-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="charge-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        {charge ? null : clients.length > 1 ? (
          <SelectField
            label={t('billing.form.client')}
            value={form.clienteId}
            onChange={(e) => {
              setForm((f) => ({
                ...f,
                clienteId: e.target.value,
                asuntoId: '',
                responsableId: '',
              }));
            }}
            options={[
              { value: '', label: t('shell.chooseClient') },
              ...clients.map((c) => ({ value: c.id, label: clientName(c) })),
            ]}
          />
        ) : null}
        <TextField
          label={t('billing.form.concepto')}
          hint={t('billing.form.conceptoHint')}
          required
          maxLength={300}
          value={form.concepto}
          onChange={(e) => {
            set('concepto', e.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('billing.form.subtotal')}
            required
            inputMode="decimal"
            value={form.subtotal}
            onChange={(e) => {
              set('subtotal', e.target.value);
            }}
          />
          <SelectField
            label={t('billing.form.moneda')}
            value={form.moneda}
            onChange={(e) => {
              set('moneda', e.target.value);
            }}
            options={MONEDAS.map((m) => ({ value: m, label: t(`billing.form.monedas.${m}`) }))}
          />
          <TextField
            type="date"
            label={t('billing.form.issued')}
            required
            value={form.fechaEmision}
            onChange={(e) => {
              set('fechaEmision', e.target.value);
            }}
          />
          <TextField
            type="date"
            label={t('billing.form.due')}
            optional={t('common.optional')}
            value={form.fechaVencimiento}
            onChange={(e) => {
              set('fechaVencimiento', e.target.value);
            }}
          />
          <TextField
            label={t('billing.form.vat')}
            hint={t('billing.form.vatHint')}
            inputMode="decimal"
            value={form.tasaIVA}
            onChange={(e) => {
              set('tasaIVA', e.target.value);
            }}
          />
          <TextField
            label={t('billing.form.invoice')}
            optional={t('common.optional')}
            maxLength={100}
            value={form.folioFactura}
            onChange={(e) => {
              set('folioFactura', e.target.value);
            }}
          />
          <TextField
            label={t('billing.form.retISR')}
            optional={t('common.optional')}
            inputMode="decimal"
            value={form.retencionISR}
            onChange={(e) => {
              set('retencionISR', e.target.value);
            }}
          />
          <TextField
            label={t('billing.form.retIVA')}
            optional={t('common.optional')}
            inputMode="decimal"
            value={form.retencionIVA}
            onChange={(e) => {
              set('retencionIVA', e.target.value);
            }}
          />
          <SelectField
            label={t('billing.form.matter')}
            optional={t('common.optional')}
            value={form.asuntoId}
            onChange={(e) => {
              set('asuntoId', e.target.value);
            }}
            options={[
              { value: '', label: t('billing.form.noMatter') },
              ...openMatters.map((a) => ({ value: a.id, label: text(a, 'titulo') ?? '' })),
            ]}
          />
          <SelectField
            label={t('billing.form.responsible')}
            optional={t('common.optional')}
            value={form.responsableId}
            onChange={(e) => {
              set('responsableId', e.target.value);
            }}
            options={[
              { value: '', label: t('billing.form.nobody') },
              ...people.map((u) => ({ value: u.id, label: text(u, 'nombre') ?? '' })),
            ]}
          />
        </div>
        <p className="text-sm text-muted-foreground">{t('billing.form.retHint')}</p>
        {preview !== null ? (
          <p className="font-medium tabular-nums" aria-live="polite">
            {t('billing.form.totalPreview', {
              total: formatMoney(preview, form.moneda === 'USD' ? 'USD' : 'MXN'),
            })}
          </p>
        ) : null}
        <TextArea
          label={t('billing.form.notes')}
          optional={t('common.optional')}
          rows={2}
          maxLength={2000}
          value={form.notas}
          onChange={(e) => {
            set('notas', e.target.value);
          }}
        />
      </form>
    </Dialog>
  );
}
