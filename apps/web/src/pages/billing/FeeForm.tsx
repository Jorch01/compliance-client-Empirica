import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_VAT,
  ESTADOS_HONORARIO,
  FEE_EVERY,
  MONEDAS,
  TABLES,
  amountsOf,
  changedFields,
  text,
  validateFields,
  type Row,
  type Value,
} from '@empirica/shared';
import { todayInCancun } from '../../domain/deadlines.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { SelectField, TextArea, TextField } from '../../ui/Field.tsx';
import { amountText, formatMoney, parseAmount, useBillingPeople } from './billing.ts';

interface Form {
  clienteId: string;
  concepto: string;
  monto: string;
  moneda: string;
  cadaMeses: string;
  diaCobro: string;
  diasCredito: string;
  desde: string;
  hasta: string;
  estado: string;
  tasaIVA: string;
  retencionISR: string;
  retencionIVA: string;
  responsableId: string;
  notas: string;
}

const str = (row: Row | undefined, field: string): string => (row ? (text(row, field) ?? '') : '');

const DAYS = [...Array.from({ length: 28 }, (_, i) => String(i + 1)), '-1'];

/**
 * A retainer, new or edited: how much before taxes, how often, on which day
 * and from when, its rates and who follows it. Its split is the partners'
 * (from its card). Saved on the device at once, offline too.
 */
export function FeeForm({
  fee,
  onClose,
  onSaved,
}: {
  fee?: Row;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const { scope, clients } = useScope();
  const today = todayInCancun();
  const [form, setForm] = useState<Form>(() => ({
    clienteId:
      [str(fee, 'clienteId'), scope.clientId, clients.length === 1 ? clients[0]?.id : null].find(
        Boolean,
      ) ?? '',
    concepto: str(fee, 'concepto'),
    monto: amountText(fee?.monto),
    moneda: str(fee, 'moneda') || 'MXN',
    cadaMeses: fee ? amountText(fee.cadaMeses) || '1' : '1',
    diaCobro: fee
      ? amountText(fee.diaCobro) || '1'
      : String(Math.min(28, Number(today.slice(8, 10)))),
    diasCredito: amountText(fee?.diasCredito),
    desde: str(fee, 'desde') || today,
    hasta: str(fee, 'hasta'),
    estado: str(fee, 'estado') || 'ACTIVO',
    tasaIVA: fee ? amountText(fee.tasaIVA) : String(DEFAULT_VAT),
    retencionISR: amountText(fee?.retencionISR),
    retencionIVA: amountText(fee?.retencionIVA),
    responsableId: fee ? str(fee, 'responsableId') : '',
    notas: str(fee, 'notas'),
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const people = useBillingPeople(form.clienteId || null);
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => {
    setForm((f) => ({ ...f, [key]: value }));
  };
  const numbers = {
    monto: parseAmount(form.monto),
    diasCredito: parseAmount(form.diasCredito),
    tasaIVA: parseAmount(form.tasaIVA),
    retencionISR: parseAmount(form.retencionISR),
    retencionIVA: parseAmount(form.retencionIVA),
  };
  const preview =
    typeof numbers.monto === 'number'
      ? amountsOf({
          subtotal: numbers.monto,
          tasaIVA: typeof numbers.tasaIVA === 'number' ? numbers.tasaIVA : 0,
          retencionISR: typeof numbers.retencionISR === 'number' ? numbers.retencionISR : 0,
          retencionIVA: typeof numbers.retencionIVA === 'number' ? numbers.retencionIVA : 0,
        }).total
      : null;

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!form.clienteId) {
      setError(t('requests.chooseClient'));
      return;
    }
    if (Object.values(numbers).includes('invalid') || form.monto.trim() === '') {
      setError(t('errors.VALIDATION'));
      return;
    }
    const value = (n: number | null | 'invalid'): Value => (typeof n === 'number' ? n : null);
    const fields: Record<string, Value> = {
      clienteId: form.clienteId,
      concepto: form.concepto.trim(),
      monto: value(numbers.monto),
      moneda: form.moneda,
      cadaMeses: Number(form.cadaMeses),
      diaCobro: Number(form.diaCobro),
      diasCredito: value(numbers.diasCredito),
      desde: form.desde || null,
      hasta: form.hasta || null,
      estado: form.estado,
      tasaIVA: value(numbers.tasaIVA),
      retencionISR: value(numbers.retencionISR),
      retencionIVA: value(numbers.retencionIVA),
      responsableId: form.responsableId || null,
      notas: form.notas.trim() || null,
    };
    const check = validateFields(TABLES.Honorarios, fields);
    if (!check.ok || !form.concepto.trim() || (form.hasta && form.hasta < form.desde)) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (fee) {
        const { clienteId: _fixed, ...changes } = changedFields(fee, check.fields);
        if (Object.keys(changes).length)
          await engine.mutate('Honorarios', 'update', fee.id, changes);
        onClose();
      } else {
        const id = crypto.randomUUID();
        await engine.mutate('Honorarios', 'create', id, check.fields);
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
      title={fee ? t('billing.fees.edit') : t('billing.fees.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="fee-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="fee-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        {fee ? null : clients.length > 1 ? (
          <SelectField
            label={t('billing.form.client')}
            value={form.clienteId}
            onChange={(e) => {
              setForm((f) => ({ ...f, clienteId: e.target.value, responsableId: '' }));
            }}
            options={[
              { value: '', label: t('shell.chooseClient') },
              ...clients.map((c) => ({ value: c.id, label: clientName(c) })),
            ]}
          />
        ) : null}
        <TextField
          label={t('billing.fees.concepto')}
          hint={t('billing.fees.conceptoHint')}
          required
          maxLength={300}
          value={form.concepto}
          onChange={(e) => {
            set('concepto', e.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('billing.fees.monto')}
            required
            inputMode="decimal"
            value={form.monto}
            onChange={(e) => {
              set('monto', e.target.value);
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
          <SelectField
            label={t('billing.fees.every')}
            value={form.cadaMeses}
            onChange={(e) => {
              set('cadaMeses', e.target.value);
            }}
            options={FEE_EVERY.map((n) => ({
              value: String(n),
              label: t(`billing.fees.everyOptions.${String(n) as '1' | '2' | '3' | '6' | '12'}`),
            }))}
          />
          <SelectField
            label={t('billing.fees.day')}
            value={form.diaCobro}
            onChange={(e) => {
              set('diaCobro', e.target.value);
            }}
            options={DAYS.map((d) => ({
              value: d,
              label: d === '-1' ? t('billing.fees.lastDay') : t('billing.fees.dayN', { day: d }),
            }))}
          />
          <TextField
            type="date"
            label={t('billing.fees.desde')}
            hint={t('billing.fees.desdeHint')}
            required
            value={form.desde}
            onChange={(e) => {
              set('desde', e.target.value);
            }}
          />
          <TextField
            type="date"
            label={t('billing.fees.hasta')}
            optional={t('common.optional')}
            value={form.hasta}
            onChange={(e) => {
              set('hasta', e.target.value);
            }}
          />
          <TextField
            label={t('billing.fees.credit')}
            hint={t('billing.fees.creditHint')}
            optional={t('common.optional')}
            inputMode="numeric"
            value={form.diasCredito}
            onChange={(e) => {
              set('diasCredito', e.target.value);
            }}
          />
          <SelectField
            label={t('billing.fees.estado')}
            hint={t('billing.fees.estadoHint')}
            value={form.estado}
            onChange={(e) => {
              set('estado', e.target.value);
            }}
            options={ESTADOS_HONORARIO.map((s) => ({
              value: s,
              label: t(`billing.fees.estados.${s}`),
            }))}
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
          label={t('billing.fees.notes')}
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
