import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'wouter';
import {
  type METODOS_PAGO,
  type TIPOS_GASTO,
  nextReminder,
  parseReparto,
  splitOf,
  text,
  type Charge,
  type Repeticion,
  type Row,
  type Value,
} from '@empirica/shared';
import { useNames } from '../data/names.ts';
import { formatDate } from '../i18n/index.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, Spinner } from '../ui/Card.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { BillingFrame } from './billing/BillingHeader.tsx';
import { ChargeForm } from './billing/ChargeForm.tsx';
import { ClientNote } from './billing/ClientNote.tsx';
import { ExpenseForm, PaymentForm } from './billing/MoneyForms.tsx';
import { ReminderForm } from './billing/ReminderForm.tsx';
import { SplitDialog } from './billing/SplitDialog.tsx';
import {
  STATUS_TONE,
  chargeLabel,
  ensureCharge,
  formatMoney,
  formatPercent,
  useBillingData,
  useParticipantNames,
} from './billing/billing.ts';

type Dialogs =
  | { kind: 'edit' }
  | { kind: 'payment'; row?: Row }
  | { kind: 'expense'; row?: Row }
  | { kind: 'reminder'; row?: Row }
  | { kind: 'split' }
  | { kind: 'note' }
  | { kind: 'cancel' }
  | { kind: 'remove' }
  | { kind: 'removePayment'; row: Row }
  | { kind: 'removeExpense'; row: Row }
  | { kind: 'removeReminder'; row: Row };

function Line({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap justify-between gap-x-4 py-1.5 ${strong ? 'font-semibold' : ''}`}
    >
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

/** What comes off, as a negative amount; nothing is "-$0.00". */
const minus = (amount: number): number => (amount > 0 ? -amount : 0);

const rateOf = (part: number, base: number): string =>
  base > 0 ? formatPercent(Math.round((part / base) * 10_000) / 100).replace(' %', '') : '0';

/** What each participant takes from the charge, as it stands. */
function SplitCard({
  charge,
  gastos,
  participantes,
  onEdit,
}: {
  charge: Charge;
  gastos: readonly Row[];
  participantes: readonly Row[];
  onEdit: (() => void) | null;
}) {
  const { t } = useTranslation();
  const name = useParticipantNames();
  const split = splitOf(charge, { gastos, participantes });
  const own = charge.row ? parseReparto(charge.row.reparto).length > 0 : false;
  const m = charge.moneda;
  return (
    <Card
      title={t('billing.split.title')}
      actions={
        onEdit ? (
          <Button size="sm" variant="secondary" icon="pencil" onClick={onEdit}>
            {t('billing.split.edit')}
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">{t('billing.split.onlyPartners')}</span>
        )
      }
    >
      <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{t('billing.split.intro')}</p>
      <p className="mb-3 text-sm">
        {charge.reparto.length === 0
          ? t('billing.split.none')
          : own
            ? t('billing.split.ownSplit')
            : t('billing.split.fromFee')}
        {split.porcentajeAsignado > 100.001 ? ` ${t('billing.split.over')}` : ''}
      </p>
      <dl className="mb-4 max-w-md divide-y divide-border text-sm">
        <Line label={t('billing.split.collected')}>{formatMoney(split.cobradoSinIVA, m)}</Line>
        <Line label={t('billing.split.shared')}>{formatMoney(minus(split.gastosComunes), m)}</Line>
        <Line label={t('billing.split.base')} strong>
          {formatMoney(split.base, m)}
        </Line>
        <Line label={t('billing.split.vat')}>{formatMoney(split.ivaPorEnterar, m)}</Line>
        {split.isrRetenido ? (
          <Line label={t('billing.split.isr')}>{formatMoney(split.isrRetenido, m)}</Line>
        ) : null}
      </dl>
      {split.proporcion > 0 && split.proporcion < 1 ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {t('billing.split.partial', { pct: rateOf(charge.pagado, charge.amounts.total) })}
        </p>
      ) : null}
      {/* Focusable: on a phone the table scrolls sideways, also with the keyboard. */}
      <div
        className="relative overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={t('billing.split.title')}
      >
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">{t('billing.split.title')}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">
                {t('billing.split.who')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t('billing.split.pct')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t('billing.split.part')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t('billing.split.own')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t('billing.split.tax')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t('billing.split.refund')}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('billing.split.net')}
              </th>
            </tr>
          </thead>
          <tbody>
            {split.lines.map((l) => (
              <tr
                key={l.participanteId ?? 'sin-repartir'}
                className="border-b border-border last:border-0"
              >
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {l.participanteId === null
                    ? t('billing.split.unassigned')
                    : (name(l.participanteId) ?? t('billing.split.unknown'))}
                </th>
                <td className="py-2 pr-3 text-right tabular-nums">{formatPercent(l.porcentaje)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(l.bruto, m)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatMoney(minus(l.gastosPropios), m)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatMoney(minus(l.impuesto), m)}
                  {l.tasaImpuesto ? (
                    <span className="block text-xs text-muted-foreground">
                      {formatPercent(l.tasaImpuesto)}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(l.reembolso, m)}</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {formatMoney(l.neto, m)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t('billing.split.estimate')}</p>
    </Card>
  );
}

/**
 * A charge (F9): its amounts and state, its payments, its expenses, the
 * split with each one's net, and its reminders. A retainer's period not
 * recorded yet shows the retainer's values and is written with the first
 * thing that hangs from it.
 */
export function BillingChargeDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { me, engine } = usePortal();
  const [, navigate] = useLocation();
  const data = useBillingData();
  const names = useNames();
  const participant = useParticipantNames();
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const [busy, setBusy] = useState(false);
  const charge = data?.charges.find((c) => c.id === id) ?? null;
  const pagos = useMemo(
    () =>
      (data?.pagos ?? [])
        .filter((p) => p.cobroId === id)
        .sort((a, b) => (text(b, 'fecha') ?? '').localeCompare(text(a, 'fecha') ?? '')),
    [data, id],
  );
  const gastos = useMemo(() => (data?.gastos ?? []).filter((g) => g.cobroId === id), [data, id]);
  const reminders = useMemo(
    () => (data?.recordatorios ?? []).filter((r) => r.cobroId === id),
    [data, id],
  );
  const fee = charge?.honorarioId
    ? (data?.honorarios.find((h) => h.id === charge.honorarioId) ?? null)
    : null;
  const mine = (row: Row): boolean => me.isAdmin || row.createdBy === me.id;
  const close = (): void => {
    setDialog(null);
  };

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await work();
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <BillingFrame
        tab="charges"
        title={t('billing.charges.title')}
        intro={t('billing.charges.intro')}
      >
        <Spinner label={t('common.loading')} />
      </BillingFrame>
    );
  }
  if (!charge) {
    return (
      <BillingFrame
        tab="charges"
        title={t('billing.charges.title')}
        intro={t('billing.charges.intro')}
      >
        <Card>
          <p>{t('billing.charge.notFound')}</p>
          <Link href="/cobranza/cobros" className="mt-2 inline-block text-link underline">
            {t('billing.charge.back')}
          </Link>
        </Card>
      </BillingFrame>
    );
  }

  const m = charge.moneda;
  const a = charge.amounts;
  const cancelled = charge.status === 'CANCELADO';
  const setEstado = (estado: Value): Promise<void> =>
    run(() => ensureCharge(engine, charge, data.honorarios, { estado }));

  return (
    <BillingFrame tab="charges" title={chargeLabel(charge)} intro={names.client(charge.clienteId)}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-2xl font-semibold tabular-nums">
            <span className="sr-only">{t('billing.charge.total')}: </span>
            {formatMoney(a.total, m)}
          </p>
          <StatusBadge tone={STATUS_TONE[charge.status]}>
            {charge.status === 'VENCIDO'
              ? t('billing.overdueDays', { count: charge.diasVencido })
              : t(`billing.status.${charge.status}`)}
          </StatusBadge>
          <Link
            href="/cobranza/cobros"
            className="text-sm text-link underline-offset-2 hover:underline"
          >
            {t('billing.charge.back')}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            icon="plus"
            disabled={cancelled}
            onClick={() => {
              setDialog({ kind: 'payment' });
            }}
          >
            {t('billing.payments.add')}
          </Button>
          <Button
            variant="secondary"
            icon="pencil"
            onClick={() => {
              setDialog({ kind: 'edit' });
            }}
          >
            {t('billing.charges.edit')}
          </Button>
          <Button
            variant="secondary"
            icon="mail"
            disabled={cancelled || charge.saldo <= 0}
            onClick={() => {
              setDialog({ kind: 'note' });
            }}
          >
            {t('billing.clientNote.button')}
          </Button>
        </div>
        {charge.row ? null : (
          <p className="flex items-start gap-2 rounded-control border border-info-border bg-info-subtle px-3 py-2 text-sm text-info-subtle-foreground">
            <Icon name="info" className="mt-0.5 size-4 text-info" />
            {t('billing.charge.notSavedNote')}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t('billing.charge.amounts')}>
            <dl className="divide-y divide-border text-sm">
              <Line label={t('billing.charge.subtotal')}>{formatMoney(a.subtotal, m)}</Line>
              <Line label={t('billing.charge.iva', { rate: rateOf(a.iva, a.subtotal) })}>
                {formatMoney(a.iva, m)}
              </Line>
              {a.retencionISR ? (
                <Line
                  label={t('billing.charge.retencionISR', {
                    rate: rateOf(a.retencionISR, a.subtotal),
                  })}
                >
                  {formatMoney(minus(a.retencionISR), m)}
                </Line>
              ) : null}
              {a.retencionIVA ? (
                <Line
                  label={t('billing.charge.retencionIVA', {
                    rate: rateOf(a.retencionIVA, a.subtotal),
                  })}
                >
                  {formatMoney(minus(a.retencionIVA), m)}
                </Line>
              ) : null}
              <Line label={t('billing.charge.total')} strong>
                {formatMoney(a.total, m)}
              </Line>
              <Line label={t('billing.charge.paid')}>{formatMoney(charge.pagado, m)}</Line>
              <Line
                label={charge.saldo < 0 ? t('billing.charge.credit') : t('billing.charge.balance')}
                strong
              >
                {formatMoney(Math.abs(charge.saldo), m)}
              </Line>
            </dl>
          </Card>
          <Card title={t('common.details')}>
            <dl className="divide-y divide-border text-sm">
              <Line label={t('billing.charge.issued')}>{formatDate(charge.fechaEmision)}</Line>
              <Line label={t('billing.charge.due')}>{formatDate(charge.fechaVencimiento)}</Line>
              <Line label={t('billing.charge.invoice')}>
                {charge.folioFactura ?? t('billing.charge.noInvoice')}
              </Line>
              {fee ? (
                <Line label={t('billing.charge.fee')}>
                  <Link
                    href="/cobranza/igualas"
                    className="text-link underline-offset-2 hover:underline"
                  >
                    {text(fee, 'concepto')}
                  </Link>
                </Line>
              ) : null}
              {charge.asuntoId ? (
                <Line label={t('billing.charge.matter')}>
                  <Link
                    href={`/asuntos/${charge.asuntoId}`}
                    className="text-link underline-offset-2 hover:underline"
                  >
                    {t('common.open')}
                  </Link>
                </Line>
              ) : null}
              <Line label={t('billing.charge.responsible')}>
                {names.user(charge.responsableId) || t('billing.form.nobody')}
              </Line>
            </dl>
            {charge.row && text(charge.row, 'notas') ? (
              <p className="mt-3 text-sm whitespace-pre-line">{text(charge.row, 'notas')}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {cancelled ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon="refresh"
                  busy={busy}
                  onClick={() => void setEstado('VIGENTE')}
                >
                  {t('billing.charge.reactivate')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDialog({ kind: 'cancel' });
                  }}
                >
                  {t('billing.charge.cancel')}
                </Button>
              )}
              {me.isAdmin && charge.row ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  onClick={() => {
                    setDialog({ kind: 'remove' });
                  }}
                >
                  {t('billing.charge.remove')}
                </Button>
              ) : null}
            </div>
          </Card>
        </div>

        <Card
          title={t('billing.payments.title')}
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon="plus"
              disabled={cancelled}
              onClick={() => {
                setDialog({ kind: 'payment' });
              }}
            >
              {t('billing.payments.add')}
            </Button>
          }
        >
          {pagos.length === 0 ? (
            <EmptyState icon="inbox" title={t('billing.payments.empty')} />
          ) : (
            <ul className="divide-y divide-border">
              {pagos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-medium tabular-nums">
                      {formatMoney(typeof p.monto === 'number' ? p.monto : 0, m)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        formatDate(text(p, 'fecha')),
                        text(p, 'metodo')
                          ? t(
                              `billing.payments.methods.${(text(p, 'metodo') ?? 'OTRO') as (typeof METODOS_PAGO)[number]}`,
                            )
                          : '',
                        text(p, 'referencia') ?? '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {mine(p) ? (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="pencil"
                        onClick={() => {
                          setDialog({ kind: 'payment', row: p });
                        }}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="trash"
                        onClick={() => {
                          setDialog({ kind: 'removePayment', row: p });
                        }}
                      >
                        {t('billing.payments.remove')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={t('billing.expenses.title')}
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon="plus"
              onClick={() => {
                setDialog({ kind: 'expense' });
              }}
            >
              {t('billing.expenses.add')}
            </Button>
          }
        >
          <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
            {t('billing.expenses.intro')}
          </p>
          {gastos.length === 0 ? (
            <EmptyState icon="inbox" title={t('billing.expenses.empty')} />
          ) : (
            <ul className="divide-y divide-border">
              {gastos.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-medium">
                      {text(g, 'concepto')}{' '}
                      <span className="tabular-nums">
                        · {formatMoney(typeof g.monto === 'number' ? g.monto : 0, m)}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        t(
                          `billing.expenses.kinds.${(text(g, 'tipo') ?? 'OTRO') as (typeof TIPOS_GASTO)[number]}`,
                        ),
                        formatDate(text(g, 'fecha')),
                        text(g, 'aCargoDe')
                          ? t('billing.expenses.onPerson', {
                              name: participant(text(g, 'aCargoDe')) ?? '',
                            })
                          : t('billing.expenses.everyone'),
                        text(g, 'pagadoPor')
                          ? t('billing.expenses.paidBy', {
                              name: participant(text(g, 'pagadoPor')) ?? '',
                            })
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {mine(g) ? (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="pencil"
                        onClick={() => {
                          setDialog({ kind: 'expense', row: g });
                        }}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="trash"
                        onClick={() => {
                          setDialog({ kind: 'removeExpense', row: g });
                        }}
                      >
                        {t('billing.expenses.remove')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <SplitCard
          charge={charge}
          gastos={data.gastos}
          participantes={data.participantes}
          onEdit={
            me.isAdmin
              ? () => {
                  setDialog({ kind: 'split' });
                }
              : null
          }
        />

        <Card
          title={t('billing.reminders.title')}
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon="plus"
              onClick={() => {
                setDialog({ kind: 'reminder' });
              }}
            >
              {t('billing.reminders.new')}
            </Button>
          }
        >
          {reminders.length === 0 ? (
            <EmptyState icon="bell" title={t('billing.reminders.empty')} />
          ) : (
            <ul className="divide-y divide-border">
              {reminders.map((r) => {
                const next = nextReminder(r, data.today);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="font-medium">{text(r, 'titulo')}</p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          t(
                            `billing.reminders.repeats.${(text(r, 'repetir') ?? 'NO') as Repeticion}`,
                          ),
                          r.activo === false
                            ? t('billing.reminders.off')
                            : next
                              ? t('billing.reminders.next', { date: formatDate(next) })
                              : t('billing.reminders.done'),
                        ].join(' · ')}
                      </p>
                    </div>
                    {mine(r) ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="pencil"
                          onClick={() => {
                            setDialog({ kind: 'reminder', row: r });
                          }}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="trash"
                          onClick={() => {
                            setDialog({ kind: 'removeReminder', row: r });
                          }}
                        >
                          {t('billing.reminders.remove')}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {dialog?.kind === 'edit' ? (
        <ChargeForm charge={charge} honorarios={data.honorarios} onClose={close} />
      ) : null}
      {dialog?.kind === 'payment' ? (
        <PaymentForm
          charge={charge}
          honorarios={data.honorarios}
          {...(dialog.row ? { payment: dialog.row } : {})}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === 'expense' ? (
        <ExpenseForm
          charge={charge}
          honorarios={data.honorarios}
          {...(dialog.row ? { expense: dialog.row } : {})}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === 'reminder' ? (
        <ReminderForm
          charge={charge}
          honorarios={data.honorarios}
          {...(dialog.row ? { reminder: dialog.row } : {})}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === 'note' ? <ClientNote charge={charge} onClose={close} /> : null}
      {dialog?.kind === 'split' ? (
        <SplitDialog
          initial={charge.reparto}
          canUseFee={Boolean(charge.honorarioId)}
          onClose={close}
          onSave={(reparto) => ensureCharge(engine, charge, data.honorarios, { reparto })}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'cancel'}
        title={t('billing.charge.cancel')}
        confirmLabel={t('billing.charge.cancel')}
        danger
        busy={busy}
        onClose={close}
        onConfirm={() => void setEstado('CANCELADO')}
      >
        <p>{t('billing.charge.cancelConfirm', { name: chargeLabel(charge) })}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === 'remove'}
        title={t('billing.charge.remove')}
        confirmLabel={t('billing.charge.remove')}
        danger
        busy={busy}
        onClose={close}
        onConfirm={() =>
          void run(async () => {
            await engine.mutate('Cobros', 'delete', charge.id);
            if (!charge.honorarioId) navigate('/cobranza/cobros');
          })
        }
      >
        <p>{t('billing.charge.removeConfirm', { name: chargeLabel(charge) })}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === 'removePayment'}
        title={t('billing.payments.remove')}
        confirmLabel={t('billing.payments.remove')}
        danger
        busy={busy}
        onClose={close}
        onConfirm={() => {
          if (dialog?.kind === 'removePayment') {
            const row = dialog.row;
            void run(async () => {
              await engine.mutate('Pagos', 'delete', row.id);
            });
          }
        }}
      >
        {dialog?.kind === 'removePayment' ? (
          <p>
            {t('billing.payments.removeConfirm', {
              amount: formatMoney(typeof dialog.row.monto === 'number' ? dialog.row.monto : 0, m),
              date: formatDate(text(dialog.row, 'fecha')),
            })}
          </p>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === 'removeExpense'}
        title={t('billing.expenses.remove')}
        confirmLabel={t('billing.expenses.remove')}
        danger
        busy={busy}
        onClose={close}
        onConfirm={() => {
          if (dialog?.kind === 'removeExpense') {
            const row = dialog.row;
            void run(async () => {
              await engine.mutate('Gastos', 'delete', row.id);
            });
          }
        }}
      >
        {dialog?.kind === 'removeExpense' ? (
          <p>{t('billing.expenses.removeConfirm', { name: text(dialog.row, 'concepto') ?? '' })}</p>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === 'removeReminder'}
        title={t('billing.reminders.remove')}
        confirmLabel={t('billing.reminders.remove')}
        danger
        busy={busy}
        onClose={close}
        onConfirm={() => {
          if (dialog?.kind === 'removeReminder') {
            const row = dialog.row;
            void run(async () => {
              await engine.mutate('RecordatoriosCobro', 'delete', row.id);
            });
          }
        }}
      >
        {dialog?.kind === 'removeReminder' ? (
          <p>{t('billing.reminders.removeConfirm', { name: text(dialog.row, 'titulo') ?? '' })}</p>
        ) : null}
      </ConfirmDialog>
    </BillingFrame>
  );
}
