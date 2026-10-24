/**
 * Billing (Cobranza, F9, PLAN.md § 28): the firm's fees and what each
 * client owes, the same on every device and on the server.
 *
 * - A fee (`Honorarios`, an iguala) charges its amount every `cadaMeses`
 *   months on `diaCobro`, from `desde` on. Each period is a charge: recorded
 *   (`Cobros`, with the period's fixed id) or not yet; an unrecorded period
 *   that already came is earned (devengado) all the same, with the fee's
 *   values. Recording it (a payment, an invoice number) writes it.
 * - A charge's total is its subtotal plus VAT minus what the client
 *   withholds. Its payments say whether it is paid, partly paid or overdue.
 * - What each participant takes (`splitOf`): what was collected without VAT
 *   (VAT belongs to the tax authority; withholdings count as paid on
 *   account), minus the expenses everyone bears, split by the percentages;
 *   then each one's own expenses and estimated tax come out of their part
 *   and what they paid out of pocket comes back.
 *
 * Nothing here is tax advice: the rates are whatever the firm types (VAT
 * starts at the general 16 %, withholdings and taxes at 0), and the screens
 * say the result is an estimate to check with the accountant.
 */
import type { Moneda, Repeticion } from './enums.ts';
import { daysBetween } from './lights.ts';
import {
  addDays,
  dateParts,
  daysInMonth,
  isoDate,
  occurrencesBetween,
  type Recurrence,
} from './recurrence.ts';
import { stableUuid } from './stable-id.ts';
import { text, type Row, type Value } from './values.ts';

/** VAT the forms start with: the general rate; the firm changes it per fee or charge. */
export const DEFAULT_VAT = 16;

/** Days overdue on which the charge's responsible person hears it in the bell. */
export const OVERDUE_NOTICE_DAYS: readonly number[] = [1, 7, 15, 30, 60, 90];

/** Every how many months a fee may be charged. */
export const FEE_EVERY: readonly number[] = [1, 2, 3, 6, 12];

/** Money to the cent, without floating dust. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Below a cent, nothing is owed. */
const CENT = 0.005;

const num = (row: Readonly<Record<string, Value>>, column: string): number => {
  const v = row[column];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/** A percentage as typed: 0 to 100, anything else counts as 0. */
const pct = (row: Readonly<Record<string, Value>>, column: string): number => {
  const v = num(row, column);
  return v > 0 && v <= 100 ? v : 0;
};

const isDate = (value: string | null): value is string =>
  value !== null && dateParts(value) !== null;

const monedaOf = (row: Row): Moneda => (row.moneda === 'USD' ? 'USD' : 'MXN');

/** The charge of a fee's period, the same id on every device. */
export function cobroId(honorarioId: string, periodo: string): string {
  return stableUuid(`cobro:${honorarioId}:${periodo}`);
}

// ── What a billing field may hold ─────────────────────────────────────────

/** Billing tabs, whose fields get the checks below on top of their type. */
export const BILLING_TABLES = [
  'Honorarios',
  'Cobros',
  'Pagos',
  'Gastos',
  'Participantes',
  'RecordatoriosCobro',
] as const;

const MONEY_MAX = 1e10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isMoney = (v: Value, positive: boolean): boolean =>
  typeof v === 'number' && Number.isFinite(v) && (positive ? v > 0 : v >= 0) && v < MONEY_MAX;

const isRate = (v: Value): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

const validShares = (v: Value): boolean => {
  if (!Array.isArray(v) || v.length > 20) return false;
  const ids = new Set<string>();
  let sum = 0;
  for (const entry of v) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const { participanteId: id, porcentaje: p } = entry;
    if (typeof id !== 'string' || !UUID.test(id) || ids.has(id)) return false;
    if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p > 100) return false;
    ids.add(id);
    sum += p;
  }
  return sum <= 100.0001;
};

/**
 * Whether a billing field holds something the portal can count with: money
 * not negative (a payment or an expense, above zero), percentages from 0 to
 * 100, a split that adds up to 100 at most, a fee's rule as the form writes
 * it. Empty values are the type check's business.
 */
export function billingFieldOk(table: string, field: string, value: Value): boolean {
  if (value === null) return true;
  switch (field) {
    case 'monto':
      return isMoney(value, table === 'Pagos' || table === 'Gastos');
    case 'subtotal':
      return isMoney(value, false);
    case 'tasaIVA':
    case 'retencionISR':
    case 'retencionIVA':
    case 'tasaImpuesto':
      return isRate(value);
    case 'cadaMeses':
      return typeof value === 'number' && FEE_EVERY.includes(value);
    case 'diaCobro':
      return value === -1 || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 28);
    case 'diasCredito':
      return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 365;
    case 'reparto':
      return validShares(value);
    case 'periodo':
      return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    case 'destinatarios':
      return (
        Array.isArray(value) &&
        value.length <= 20 &&
        value.every((x) => typeof x === 'string' && UUID.test(x))
      );
    default:
      return true;
  }
}

// ── Amounts ────────────────────────────────────────────────────────────────

export interface Amounts {
  subtotal: number;
  iva: number;
  retencionISR: number;
  retencionIVA: number;
  /** What the client pays: subtotal + VAT − withholdings. */
  total: number;
}

/** A charge's amounts (or a fee's, from its `monto`). */
export function amountsOf(row: Readonly<Record<string, Value>>): Amounts {
  const subtotal = round2(num(row, 'subtotal') || num(row, 'monto'));
  const iva = round2((subtotal * pct(row, 'tasaIVA')) / 100);
  const retencionISR = round2((subtotal * pct(row, 'retencionISR')) / 100);
  const retencionIVA = round2((subtotal * pct(row, 'retencionIVA')) / 100);
  return {
    subtotal,
    iva,
    retencionISR,
    retencionIVA,
    total: round2(subtotal + iva - retencionISR - retencionIVA),
  };
}

// ── The split ─────────────────────────────────────────────────────────────

export interface Share {
  participanteId: string;
  /** 0 to 100. */
  porcentaje: number;
}

/** Reads a split (`reparto`); malformed entries are left out. */
export function parseReparto(value: Value | undefined): Share[] {
  if (!Array.isArray(value)) return [];
  const out: Share[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const id = entry.participanteId;
    const p = entry.porcentaje;
    if (typeof id !== 'string' || !id || typeof p !== 'number' || !Number.isFinite(p)) continue;
    if (p <= 0 || p > 100 || out.some((s) => s.participanteId === id)) continue;
    out.push({ participanteId: id, porcentaje: p });
  }
  return out;
}

/** The sum of a split's percentages, to the hundredth. */
export const shareTotal = (shares: readonly Share[]): number =>
  round2(shares.reduce((sum, s) => sum + s.porcentaje, 0));

// ── Periods and charges ───────────────────────────────────────────────────

/** A fee's rule: every `cadaMeses` months, on `diaCobro` (1 to 28, or −1, the last day). */
export function feeRule(fee: Readonly<Record<string, Value>>): Recurrence {
  const every = num(fee, 'cadaMeses');
  const day = num(fee, 'diaCobro');
  return {
    freq: 'MONTHLY',
    interval: Number.isInteger(every) && every >= 1 && every <= 12 ? every : 1,
    day: day === -1 || (Number.isInteger(day) && day >= 1 && day <= 28) ? day : 1,
  };
}

export interface FeePeriod {
  /** "2026-10". */
  periodo: string;
  /** The day it is charged. */
  fecha: string;
}

/** A fee's periods from its start to `until` (and never past its end), in order. */
export function feePeriods(fee: Row, until: string): FeePeriod[] {
  const desde = text(fee, 'desde');
  if (!isDate(desde)) return [];
  const hasta = text(fee, 'hasta');
  const end = isDate(hasta) && hasta < until ? hasta : until;
  if (end < desde) return [];
  return occurrencesBetween(feeRule(fee), desde, desde, end).map((fecha) => ({
    periodo: fecha.slice(0, 7),
    fecha,
  }));
}

export type ChargeStatus = 'POR_COBRAR' | 'PARCIAL' | 'PAGADO' | 'VENCIDO' | 'CANCELADO';

export interface Charge {
  /** The record's id; for a fee's period, the fixed one (cobroId), recorded or not. */
  id: string;
  /** The record, or null for a period not recorded yet. */
  row: Row | null;
  clienteId: string;
  honorarioId: string | null;
  periodo: string | null;
  asuntoId: string | null;
  concepto: string;
  moneda: Moneda;
  fechaEmision: string;
  fechaVencimiento: string;
  amounts: Amounts;
  pagado: number;
  /** total − paid; negative when the client paid more. */
  saldo: number;
  status: ChargeStatus;
  /** Days past its due date while something is owed; 0 otherwise. */
  diasVencido: number;
  ultimoPago: string | null;
  folioFactura: string | null;
  responsableId: string | null;
  /** The split that applies: its own, else its fee's. */
  reparto: Share[];
}

export interface BillingRows {
  honorarios: readonly Row[];
  cobros: readonly Row[];
  pagos: readonly Row[];
}

const live = (rows: readonly Row[]): Row[] => rows.filter((r) => !r.deleted);

/** What a charge stands at: cancelled, paid, overdue, partly paid or to be collected. */
export function chargeStatus(
  charge: Pick<Charge, 'amounts' | 'pagado' | 'fechaVencimiento'> & { cancelado: boolean },
  today: string,
): ChargeStatus {
  if (charge.cancelado) return 'CANCELADO';
  const saldo = charge.amounts.total - charge.pagado;
  if (saldo <= CENT) return 'PAGADO';
  if (charge.fechaVencimiento < today) return 'VENCIDO';
  return charge.pagado > CENT ? 'PARCIAL' : 'POR_COBRAR';
}

/** The values of a fee's period as it would be recorded (what `Cobros` gets). */
export function periodFields(fee: Row, period: FeePeriod): Record<string, Value> {
  const credit = num(fee, 'diasCredito');
  return {
    clienteId: text(fee, 'clienteId'),
    honorarioId: fee.id,
    periodo: period.periodo,
    concepto: text(fee, 'concepto') ?? '',
    fechaEmision: period.fecha,
    fechaVencimiento: addDays(period.fecha, credit > 0 ? Math.round(credit) : 0),
    subtotal: num(fee, 'monto'),
    moneda: monedaOf(fee),
    tasaIVA: fee.tasaIVA ?? null,
    retencionISR: fee.retencionISR ?? null,
    retencionIVA: fee.retencionIVA ?? null,
    estado: 'VIGENTE',
    responsableId: text(fee, 'responsableId'),
  };
}

/**
 * Every charge earned up to `today`: the recorded ones, and each period of an
 * active fee that already came and nobody recorded yet. Newest first.
 */
export function chargesOf(rows: BillingRows, today: string): Charge[] {
  const fees = new Map(live(rows.honorarios).map((f) => [f.id, f]));
  const paid = new Map<string, { sum: number; last: string | null }>();
  for (const p of live(rows.pagos)) {
    const id = text(p, 'cobroId');
    if (!id) continue;
    const entry = paid.get(id) ?? { sum: 0, last: null };
    entry.sum += num(p, 'monto');
    const fecha = text(p, 'fecha');
    if (fecha && (!entry.last || fecha > entry.last)) entry.last = fecha;
    paid.set(id, entry);
  }

  const build = (id: string, row: Row | null, values: Readonly<Record<string, Value>>): Charge => {
    const honorarioId = text(values, 'honorarioId');
    const fee = honorarioId ? fees.get(honorarioId) : undefined;
    const fechaEmision = text(values, 'fechaEmision') ?? today;
    const fechaVencimiento = text(values, 'fechaVencimiento') ?? fechaEmision;
    const amounts = amountsOf(values);
    const p = paid.get(id);
    const pagado = round2(p?.sum ?? 0);
    const cancelado = values.estado === 'CANCELADO';
    const status = chargeStatus({ amounts, pagado, fechaVencimiento, cancelado }, today);
    const own = parseReparto(values.reparto);
    return {
      id,
      row,
      clienteId: text(values, 'clienteId') ?? '',
      honorarioId,
      periodo: text(values, 'periodo'),
      asuntoId: text(values, 'asuntoId'),
      concepto: text(values, 'concepto') ?? '',
      moneda: values.moneda === 'USD' ? 'USD' : 'MXN',
      fechaEmision,
      fechaVencimiento,
      amounts,
      pagado,
      saldo: round2(amounts.total - pagado),
      status,
      diasVencido: status === 'VENCIDO' ? daysBetween(fechaVencimiento, today) : 0,
      ultimoPago: p?.last ?? null,
      folioFactura: text(values, 'folioFactura'),
      responsableId: text(values, 'responsableId'),
      reparto: own.length ? own : fee ? parseReparto(fee.reparto) : [],
    };
  };

  const out: Charge[] = [];
  const recorded = new Set<string>();
  // A recorded period deleted is as if never recorded: its fee earns it again
  // (with its payments, which name the same id). To drop a period, cancel it.
  for (const c of live(rows.cobros)) {
    recorded.add(c.id);
    out.push(build(c.id, c, c));
  }
  for (const fee of fees.values()) {
    if (fee.estado !== 'ACTIVO') continue;
    for (const period of feePeriods(fee, today)) {
      const id = cobroId(fee.id, period.periodo);
      if (recorded.has(id)) continue;
      out.push(build(id, null, periodFields(fee, period)));
    }
  }
  return out.sort(
    (a, b) => b.fechaEmision.localeCompare(a.fechaEmision) || a.concepto.localeCompare(b.concepto),
  );
}

/** A fee's next charges after `today`: what is coming. */
export function upcomingPeriods(fee: Row, today: string, count = 3): FeePeriod[] {
  if (fee.estado !== 'ACTIVO') return [];
  const horizon = addDays(today, 31 * 12 * Math.max(1, feeRule(fee).interval));
  return feePeriods(fee, horizon)
    .filter((p) => p.fecha > today)
    .slice(0, count);
}

/** The charge of a record's id, recorded or a fee's period not yet recorded. */
export function chargeById(rows: BillingRows, id: string, today: string): Charge | null {
  return chargesOf(rows, today).find((c) => c.id === id) ?? null;
}

// ── What each participant takes ───────────────────────────────────────────

export interface SplitLine {
  /** null: the part nobody was given yet. */
  participanteId: string | null;
  porcentaje: number;
  /** Their part of the base. */
  bruto: number;
  /** Expenses on them alone. */
  gastosPropios: number;
  /** Their estimated tax (their rate, on their part after their own expenses). */
  impuesto: number;
  tasaImpuesto: number;
  /** What they paid out of pocket and get back. */
  reembolso: number;
  neto: number;
}

export interface Split {
  /** What was collected, as a share of the total (0 to 1). */
  proporcion: number;
  /** Collected fees without VAT (withholdings included: they are paid on account). */
  cobradoSinIVA: number;
  /** VAT collected, net of what the client withheld: the tax authority's, not the firm's. */
  ivaPorEnterar: number;
  /** ISR the client withheld: credited against the firm's taxes. */
  isrRetenido: number;
  /** Expenses everyone in the split bears. */
  gastosComunes: number;
  /** What is split: collected without VAT − shared expenses. */
  base: number;
  lines: SplitLine[];
  /** The sum of the percentages given; under 100 leaves a part unassigned. */
  porcentajeAsignado: number;
}

export interface SplitOptions {
  /** Collected so far (by default, the charge's payments); the dashboard passes a month's. */
  pagado?: number;
  /** Its expenses; by default none. */
  gastos?: readonly Row[];
  participantes?: readonly Row[];
}

/** What each participant takes from a charge, from what was collected. */
export function splitOf(charge: Charge, options: SplitOptions = {}): Split {
  const { total, subtotal, iva, retencionISR, retencionIVA } = charge.amounts;
  const pagado = options.pagado ?? charge.pagado;
  const proporcion =
    charge.status === 'CANCELADO' && options.pagado === undefined
      ? 0
      : total > 0
        ? Math.min(1, Math.max(0, pagado / total))
        : pagado > 0
          ? 1
          : 0;
  const gastos = live(options.gastos ?? []).filter((g) => text(g, 'cobroId') === charge.id);
  const rates = new Map(
    (options.participantes ?? []).map((p) => [p.id, pct(p, 'tasaImpuesto')] as const),
  );

  const cobradoSinIVA = round2(subtotal * proporcion);
  let gastosComunes = 0;
  const propios = new Map<string, number>();
  const reembolsos = new Map<string, number>();
  for (const g of gastos) {
    const monto = num(g, 'monto');
    const on = text(g, 'aCargoDe');
    if (on) propios.set(on, (propios.get(on) ?? 0) + monto);
    else gastosComunes += monto;
    const by = text(g, 'pagadoPor');
    if (by) reembolsos.set(by, (reembolsos.get(by) ?? 0) + monto);
  }
  gastosComunes = round2(gastosComunes);
  const base = round2(cobradoSinIVA - gastosComunes);

  const line = (participanteId: string | null, porcentaje: number): SplitLine => {
    const bruto = round2((base * porcentaje) / 100);
    const gastosPropios = round2(participanteId ? (propios.get(participanteId) ?? 0) : 0);
    const tasaImpuesto = participanteId ? (rates.get(participanteId) ?? 0) : 0;
    const before = bruto - gastosPropios;
    const impuesto = round2((Math.max(0, before) * tasaImpuesto) / 100);
    const reembolso = round2(participanteId ? (reembolsos.get(participanteId) ?? 0) : 0);
    return {
      participanteId,
      porcentaje,
      bruto,
      gastosPropios,
      impuesto,
      tasaImpuesto,
      reembolso,
      neto: round2(before - impuesto + reembolso),
    };
  };

  const lines = charge.reparto.map((s) => line(s.participanteId, s.porcentaje));
  // Whoever bears or paid an expense is in the split, even with no percentage.
  for (const id of new Set([...propios.keys(), ...reembolsos.keys()])) {
    if (!lines.some((l) => l.participanteId === id)) lines.push(line(id, 0));
  }
  const asignado = shareTotal(charge.reparto);
  if (asignado < 100 - 0.001) lines.push(line(null, round2(100 - asignado)));

  return {
    proporcion,
    cobradoSinIVA,
    ivaPorEnterar: round2((iva - retencionIVA) * proporcion),
    isrRetenido: round2(retencionISR * proporcion),
    gastosComunes,
    base,
    lines,
    porcentajeAsignado: asignado,
  };
}

// ── The dashboard ─────────────────────────────────────────────────────────

export interface Totals {
  /** Earned in the range: the totals of the charges issued in it. */
  devengado: number;
  /** Received in the range: payments dated in it. */
  cobrado: number;
  /** Owed today, overdue or not. */
  porCobrar: number;
  /** Owed today and past its due date. */
  vencido: number;
}

export interface Range {
  from: string;
  to: string;
}

const inRange = (date: string | null, range: Range): boolean =>
  date !== null && date >= range.from && date <= range.to;

/** "2026-10" → its first and last day. */
export function monthRange(periodo: string): Range {
  const y = Number(periodo.slice(0, 4));
  const m = Number(periodo.slice(5, 7));
  return { from: isoDate(y, m, 1), to: isoDate(y, m, daysInMonth(y, m)) };
}

export const yearRange = (year: number): Range => ({
  from: isoDate(year, 1, 1),
  to: isoDate(year, 12, 31),
});

const emptyTotals = (): Totals => ({ devengado: 0, cobrado: 0, porCobrar: 0, vencido: 0 });

/** The four numbers of the dashboard, per currency (pesos and dollars never add up). */
export function totalsOf(
  charges: readonly Charge[],
  pagos: readonly Row[],
  range: Range,
): Record<Moneda, Totals> {
  const out: Record<Moneda, Totals> = { MXN: emptyTotals(), USD: emptyTotals() };
  const byId = new Map(charges.map((c) => [c.id, c]));
  for (const c of charges) {
    if (c.status === 'CANCELADO') continue;
    const t = out[c.moneda];
    if (inRange(c.fechaEmision, range)) t.devengado += c.amounts.total;
    if (c.saldo > CENT) {
      t.porCobrar += c.saldo;
      if (c.status === 'VENCIDO') t.vencido += c.saldo;
    }
  }
  for (const p of live(pagos)) {
    const charge = byId.get(text(p, 'cobroId') ?? '');
    if (!charge || !inRange(text(p, 'fecha'), range)) continue;
    out[charge.moneda].cobrado += num(p, 'monto');
  }
  for (const t of Object.values(out)) {
    t.devengado = round2(t.devengado);
    t.cobrado = round2(t.cobrado);
    t.porCobrar = round2(t.porCobrar);
    t.vencido = round2(t.vencido);
  }
  return out;
}

export const AGING_BUCKETS = ['alCorriente', 'd1a30', 'd31a60', 'd61a90', 'mas90'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

const bucketOf = (c: Charge): AgingBucket => {
  if (c.status !== 'VENCIDO') return 'alCorriente';
  if (c.diasVencido <= 30) return 'd1a30';
  if (c.diasVencido <= 60) return 'd31a60';
  if (c.diasVencido <= 90) return 'd61a90';
  return 'mas90';
};

/** What is owed today by how long it is overdue, in one currency. */
export function agingOf(charges: readonly Charge[], moneda: Moneda): Record<AgingBucket, number> {
  const out = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>;
  for (const c of charges) {
    if (c.status === 'CANCELADO' || c.moneda !== moneda || c.saldo <= CENT) continue;
    out[bucketOf(c)] += c.saldo;
  }
  for (const b of AGING_BUCKETS) out[b] = round2(out[b]);
  return out;
}

export interface MonthPoint {
  periodo: string;
  devengado: number;
  cobrado: number;
}

/** "2026-10" moved by `n` months. */
export function shiftPeriod(periodo: string, n: number): string {
  const y = Number(periodo.slice(0, 4));
  const m = Number(periodo.slice(5, 7));
  const i = y * 12 + (m - 1) + n;
  return `${String(Math.floor(i / 12)).padStart(4, '0')}-${String((i % 12) + 1).padStart(2, '0')}`;
}

/** Earned and received, month by month, the `months` months up to `last`. */
export function monthlySeries(
  charges: readonly Charge[],
  pagos: readonly Row[],
  last: string,
  moneda: Moneda,
  months = 12,
): MonthPoint[] {
  const points = Array.from({ length: months }, (_, i) => ({
    periodo: shiftPeriod(last, i - months + 1),
    devengado: 0,
    cobrado: 0,
  }));
  const at = new Map(points.map((p) => [p.periodo, p]));
  const byId = new Map(charges.map((c) => [c.id, c]));
  for (const c of charges) {
    if (c.status === 'CANCELADO' || c.moneda !== moneda) continue;
    const p = at.get(c.fechaEmision.slice(0, 7));
    if (p) p.devengado += c.amounts.total;
  }
  for (const pago of live(pagos)) {
    const c = byId.get(text(pago, 'cobroId') ?? '');
    const p = at.get((text(pago, 'fecha') ?? '').slice(0, 7));
    if (c && p && c.moneda === moneda) p.cobrado += num(pago, 'monto');
  }
  return points.map((p) => ({ ...p, devengado: round2(p.devengado), cobrado: round2(p.cobrado) }));
}

export interface Earnings {
  participanteId: string | null;
  /** Their part, after the expenses on them alone and before their tax. */
  bruto: number;
  impuesto: number;
  neto: number;
}

/**
 * What each participant took from the payments received in `range`, in one
 * currency: each charge split by what came in that range, with the expenses
 * dated in it (or, undated, recorded in it).
 */
export function earningsOf(
  charges: readonly Charge[],
  rows: { pagos: readonly Row[]; gastos: readonly Row[]; participantes: readonly Row[] },
  range: Range,
  moneda: Moneda,
): Earnings[] {
  const paidIn = new Map<string, number>();
  for (const p of live(rows.pagos)) {
    if (!inRange(text(p, 'fecha'), range)) continue;
    const id = text(p, 'cobroId') ?? '';
    paidIn.set(id, (paidIn.get(id) ?? 0) + num(p, 'monto'));
  }
  const gastosIn = live(rows.gastos).filter((g) =>
    inRange(text(g, 'fecha') ?? (text(g, 'createdAt') ?? '').slice(0, 10), range),
  );
  const totals = new Map<string | null, Earnings>();
  for (const c of charges) {
    if (c.moneda !== moneda) continue;
    const pagado = paidIn.get(c.id) ?? 0;
    const gastos = gastosIn.filter((g) => text(g, 'cobroId') === c.id);
    if (pagado <= 0 && gastos.length === 0) continue;
    const split = splitOf(c, { pagado, gastos, participantes: rows.participantes });
    for (const l of split.lines) {
      const e = totals.get(l.participanteId) ?? {
        participanteId: l.participanteId,
        bruto: 0,
        impuesto: 0,
        neto: 0,
      };
      e.bruto += l.bruto - l.gastosPropios;
      e.impuesto += l.impuesto;
      e.neto += l.neto;
      totals.set(l.participanteId, e);
    }
  }
  return [...totals.values()]
    .map((e) => ({
      ...e,
      bruto: round2(e.bruto),
      impuesto: round2(e.impuesto),
      neto: round2(e.neto),
    }))
    .sort((a, b) => b.neto - a.neto);
}

// ── Reminders ─────────────────────────────────────────────────────────────

const STEP: Record<Repeticion, { days: number } | { months: number } | null> = {
  NO: null,
  SEMANAL: { days: 7 },
  QUINCENAL: { days: 15 },
  MENSUAL: { months: 1 },
  BIMESTRAL: { months: 2 },
  TRIMESTRAL: { months: 3 },
  SEMESTRAL: { months: 6 },
  ANUAL: { months: 12 },
};

const repeticionOf = (row: Row): Repeticion =>
  typeof row.repetir === 'string' && row.repetir in STEP ? (row.repetir as Repeticion) : 'NO';

/** The `n`-th month after `start`, on its day (or the month's last, if shorter). */
function addMonths(start: string, n: number): string {
  const p = dateParts(start);
  if (!p) return start;
  const i = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return isoDate(y, m, Math.min(p.d, daysInMonth(y, m)));
}

/** A reminder's dates from `from` to `to`, in order (at most 400). */
export function reminderDates(rec: Row, from: string, to: string): string[] {
  const start = text(rec, 'fecha');
  if (!isDate(start) || rec.activo === false || rec.deleted) return [];
  const hasta = text(rec, 'hasta');
  const end = isDate(hasta) && hasta < to ? hasta : to;
  const step = STEP[repeticionOf(rec)];
  const out: string[] = [];
  for (let k = 0; out.length < 400; k++) {
    const date = !step
      ? start
      : 'days' in step
        ? addDays(start, step.days * k)
        : addMonths(start, step.months * k);
    if (date > end || (!step && k > 0)) break;
    if (date >= from) out.push(date);
    if (!step) break;
    // Weekly steps from a start far in the past: jump close to `from` at once.
    if ('days' in step && date < from) {
      const behind = Math.floor(daysBetween(date, from) / step.days);
      if (behind > 1) k += behind - 1;
    }
  }
  return out;
}

/** The next time a reminder falls, today included. */
export function nextReminder(rec: Row, today: string): string | null {
  return reminderDates(rec, today, addDays(today, 400))[0] ?? null;
}

/** Whether a reminder falls today. */
export const remindsOn = (rec: Row, today: string): boolean =>
  reminderDates(rec, today, today).length > 0;

/** Who hears a reminder: the people it names, else whoever wrote it. */
export function reminderRecipients(rec: Row): string[] {
  const list = Array.isArray(rec.destinatarios)
    ? rec.destinatarios.filter((x): x is string => typeof x === 'string' && x !== '')
    : [];
  const author = text(rec, 'createdBy');
  return list.length ? [...new Set(list)] : author ? [author] : [];
}
