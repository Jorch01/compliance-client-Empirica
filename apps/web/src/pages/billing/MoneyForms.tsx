import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  METODOS_PAGO,
  TABLES,
  TIPOS_GASTO,
  changedFields,
  round2,
  text,
  validateFields,
  type Charge,
  type Row,
  type Value,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { todayInCancun } from '../../domain/deadlines.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { SelectField, TextArea, TextField } from '../../ui/Field.tsx';
import { amountText, ensureCharge, formatMoney, parseAmount } from './billing.ts';

const str = (row: Row | undefined, field: string): string => (row ? (text(row, field) ?? '') : '');

/**
 * A payment of a charge, new or corrected: when, how much, how. A retainer's
 * period not recorded yet is written first, so the payment hangs from it.
 * Offline too: both travel in order with the next sync.
 */
export function PaymentForm({
  charge,
  honorarios,
  payment,
  onClose,
}: {
  charge: Charge;
  honorarios: readonly Row[];
  payment?: Row;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const [fecha, setFecha] = useState(str(payment, 'fecha') || todayInCancun());
  const [monto, setMonto] = useState(
    payment ? amountText(payment.monto) : charge.saldo > 0 ? String(charge.saldo) : '',
  );
  const [metodo, setMetodo] = useState(str(payment, 'metodo') || 'TRANSFERENCIA');
  const [referencia, setReferencia] = useState(str(payment, 'referencia'));
  const [notas, setNotas] = useState(str(payment, 'notas'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const amount = parseAmount(monto);
    const fields: Record<string, Value> = {
      fecha,
      monto: typeof amount === 'number' ? round2(amount) : null,
      metodo,
      referencia: referencia.trim() || null,
      notas: notas.trim() || null,
    };
    const check = validateFields(TABLES.Pagos, fields);
    if (!check.ok || typeof amount !== 'number' || !fecha) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (payment) {
        const changes = changedFields(payment, check.fields);
        if (Object.keys(changes).length)
          await engine.mutate('Pagos', 'update', payment.id, changes);
      } else {
        await ensureCharge(engine, charge, honorarios);
        await engine.mutate('Pagos', 'create', crypto.randomUUID(), {
          ...check.fields,
          clienteId: charge.clienteId,
          cobroId: charge.id,
        });
      }
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
      title={payment ? t('billing.payments.edit') : t('billing.payments.add')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="payment-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="payment-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            type="date"
            label={t('billing.payments.fecha')}
            required
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
            }}
          />
          <TextField
            label={t('billing.payments.monto')}
            hint={t('billing.payments.montoHint', {
              amount: formatMoney(charge.saldo, charge.moneda),
            })}
            required
            inputMode="decimal"
            value={monto}
            onChange={(e) => {
              setMonto(e.target.value);
            }}
          />
          <SelectField
            label={t('billing.payments.metodo')}
            value={metodo}
            onChange={(e) => {
              setMetodo(e.target.value);
            }}
            options={METODOS_PAGO.map((m) => ({
              value: m,
              label: t(`billing.payments.methods.${m}`),
            }))}
          />
          <TextField
            label={t('billing.payments.referencia')}
            hint={t('billing.payments.referenciaHint')}
            optional={t('common.optional')}
            maxLength={200}
            value={referencia}
            onChange={(e) => {
              setReferencia(e.target.value);
            }}
          />
        </div>
        <TextArea
          label={t('billing.payments.notes')}
          optional={t('common.optional')}
          rows={2}
          maxLength={2000}
          value={notas}
          onChange={(e) => {
            setNotas(e.target.value);
          }}
        />
      </form>
    </Dialog>
  );
}

/**
 * An expense, commission or tax of a charge: everyone's (it comes out before
 * the split) or one participant's, and who paid it out of pocket, if anyone.
 */
export function ExpenseForm({
  charge,
  honorarios,
  expense,
  onClose,
}: {
  charge: Charge;
  honorarios: readonly Row[];
  expense?: Row;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const participantes = useRows('Participantes');
  const [concepto, setConcepto] = useState(str(expense, 'concepto'));
  const [tipo, setTipo] = useState(str(expense, 'tipo') || 'COMISION');
  const [monto, setMonto] = useState(amountText(expense?.monto));
  const [percent, setPercent] = useState('');
  const [fecha, setFecha] = useState(str(expense, 'fecha') || todayInCancun());
  const [aCargoDe, setACargoDe] = useState(str(expense, 'aCargoDe'));
  const [pagadoPor, setPagadoPor] = useState(str(expense, 'pagadoPor'));
  const [notas, setNotas] = useState(str(expense, 'notas'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = charge.pagado > 0 ? charge.pagado : charge.amounts.total;
  const people = (participantes ?? []).filter(
    (p) => p.activo !== false || p.id === aCargoDe || p.id === pagadoPor,
  );

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const amount = parseAmount(monto);
    const fields: Record<string, Value> = {
      concepto: concepto.trim(),
      tipo,
      monto: typeof amount === 'number' ? round2(amount) : null,
      fecha: fecha || null,
      aCargoDe: aCargoDe || null,
      pagadoPor: pagadoPor || null,
      notas: notas.trim() || null,
    };
    const check = validateFields(TABLES.Gastos, fields);
    if (!check.ok || typeof amount !== 'number' || !concepto.trim()) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (expense) {
        const changes = changedFields(expense, check.fields);
        if (Object.keys(changes).length)
          await engine.mutate('Gastos', 'update', expense.id, changes);
      } else {
        await ensureCharge(engine, charge, honorarios);
        await engine.mutate('Gastos', 'create', crypto.randomUUID(), {
          ...check.fields,
          clienteId: charge.clienteId,
          cobroId: charge.id,
        });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const options = [...people.map((p) => ({ value: p.id, label: text(p, 'nombre') ?? '' }))];

  return (
    <Dialog
      open
      onClose={onClose}
      error={error}
      size="lg"
      title={expense ? t('billing.expenses.edit') : t('billing.expenses.add')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="expense-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="expense-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        <p className="text-sm text-muted-foreground">{t('billing.expenses.intro')}</p>
        <TextField
          label={t('billing.expenses.concepto')}
          hint={t('billing.expenses.conceptoHint')}
          required
          maxLength={300}
          value={concepto}
          onChange={(e) => {
            setConcepto(e.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('billing.expenses.tipo')}
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value);
            }}
            options={TIPOS_GASTO.map((k) => ({
              value: k,
              label: t(`billing.expenses.kinds.${k}`),
            }))}
          />
          <TextField
            type="date"
            label={t('billing.expenses.fecha')}
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
            }}
          />
          <TextField
            label={t('billing.expenses.monto')}
            required
            inputMode="decimal"
            value={monto}
            onChange={(e) => {
              setMonto(e.target.value);
            }}
          />
          <TextField
            label={t('billing.expenses.percent')}
            hint={t('billing.expenses.percentHint', { base: formatMoney(base, charge.moneda) })}
            optional={t('common.optional')}
            inputMode="decimal"
            value={percent}
            onChange={(e) => {
              setPercent(e.target.value);
              const p = parseAmount(e.target.value);
              if (typeof p === 'number' && p > 0 && p <= 100) {
                setMonto(String(round2((base * p) / 100)));
              }
            }}
          />
          <SelectField
            label={t('billing.expenses.aCargoDe')}
            value={aCargoDe}
            onChange={(e) => {
              setACargoDe(e.target.value);
            }}
            options={[{ value: '', label: t('billing.expenses.everyone') }, ...options]}
          />
          <SelectField
            label={t('billing.expenses.pagadoPor')}
            hint={t('billing.expenses.pagadoPorHint')}
            value={pagadoPor}
            onChange={(e) => {
              setPagadoPor(e.target.value);
            }}
            options={[{ value: '', label: t('billing.expenses.nobody') }, ...options]}
          />
        </div>
        <TextArea
          label={t('billing.expenses.notes')}
          optional={t('common.optional')}
          rows={2}
          maxLength={2000}
          value={notas}
          onChange={(e) => {
            setNotas(e.target.value);
          }}
        />
      </form>
    </Dialog>
  );
}
