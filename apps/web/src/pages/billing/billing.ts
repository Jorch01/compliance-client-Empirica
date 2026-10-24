/**
 * What the billing screens share (F9, PLAN.md § 28): who may see billing,
 * its rows on this device, the charges of the chosen client (the recorded
 * ones and those its retainers generate), money in the interface's
 * language, and the names of the participants.
 */
import { useMemo } from 'react';
import {
  chargesOf,
  hasBillingAccess,
  periodFields,
  text,
  type Charge,
  type ChargeStatus,
  type Moneda,
  type Row,
  type Value,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { todayInCancun } from '../../domain/deadlines.ts';
import { languageTag } from '../../i18n/index.ts';
import { useScope } from '../../portal/scope.ts';
import type { SyncEngine } from '../../sync/engine.ts';
import type { Tone } from '../../ui/StatusBadge.tsx';
import { periodText } from '../reports/reports.ts';
import './texts.ts';

export interface BillingData {
  today: string;
  honorarios: Row[];
  cobros: Row[];
  pagos: Row[];
  gastos: Row[];
  recordatorios: Row[];
  participantes: Row[];
  /** Recorded and generated, newest first. */
  charges: Charge[];
}

/** Billing of the chosen client (or of all the user's clients); undefined while loading. */
export function useBillingData(): BillingData | undefined {
  const { scope } = useScope();
  const honorarios = useRows('Honorarios', scope.clientId);
  const cobros = useRows('Cobros', scope.clientId);
  const pagos = useRows('Pagos', scope.clientId);
  const gastos = useRows('Gastos', scope.clientId);
  const recordatorios = useRows('RecordatoriosCobro', scope.clientId);
  const participantes = useRows('Participantes');
  const today = todayInCancun();
  return useMemo(() => {
    if (!honorarios || !cobros || !pagos || !gastos || !recordatorios || !participantes) {
      return undefined;
    }
    return {
      today,
      honorarios,
      cobros,
      pagos,
      gastos,
      recordatorios,
      participantes,
      charges: chargesOf({ honorarios, cobros, pagos }, today),
    };
  }, [honorarios, cobros, pagos, gastos, recordatorios, participantes, today]);
}

/** "$29,000.00" (pesos) or "USD 1,500.00", in the interface's language. */
export function formatMoney(amount: number, moneda: Moneda = 'MXN'): string {
  return new Intl.NumberFormat(languageTag(), {
    style: 'currency',
    currency: moneda,
    currencyDisplay: moneda === 'MXN' ? 'narrowSymbol' : 'code',
  }).format(amount);
}

/** "29 mil" or "29K": a chart's axis. */
export function formatCompact(amount: number): string {
  return new Intl.NumberFormat(languageTag(), {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

/** "12.5 %". */
export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat(languageTag(), { maximumFractionDigits: 2 }).format(value)} %`;
}

export const STATUS_TONE: Record<ChargeStatus, Tone> = {
  POR_COBRAR: 'info',
  PARCIAL: 'info',
  PAGADO: 'success',
  VENCIDO: 'danger',
  CANCELADO: 'neutral',
};

/** "Iguala mensual · octubre de 2026" (a fee's period), or the charge's own words. */
export const chargeLabel = (c: Pick<Charge, 'concepto' | 'periodo'>): string =>
  c.periodo ? `${c.concepto} · ${periodText(c.periodo)}` : c.concepto;

/** Names of the participants, by id. */
export function useParticipantNames(): (id: string | null) => string | null {
  const rows = useRows('Participantes');
  return useMemo(() => {
    const names = new Map((rows ?? []).map((p) => [p.id, text(p, 'nombre') ?? ''] as const));
    return (id: string | null) => (id ? (names.get(id) ?? null) : null);
  }, [rows]);
}

/** The people of the firm who may work a client's billing: partners and authorized lawyers. */
export function useBillingPeople(clienteId: string | null): Row[] {
  const usuarios = useRows('Usuarios');
  const membresias = useRows('Membresias');
  return useMemo(() => {
    if (!clienteId) return [];
    return (usuarios ?? [])
      .filter((u) => hasBillingAccess(u))
      .filter(
        (u) =>
          u.rolBase === 'SOCIO_ADMIN' ||
          (membresias ?? []).some(
            (m) => m.usuarioId === u.id && m.clienteId === clienteId && m.estado === 'ACTIVA',
          ),
      )
      .sort((a, b) => (text(a, 'nombre') ?? '').localeCompare(text(b, 'nombre') ?? '', 'es'));
  }, [usuarios, membresias, clienteId]);
}

/**
 * Writes a retainer's period that was only generated, so a payment, an
 * expense, a reminder or an edit can hang from it. Its id is fixed: every
 * device writes the same record.
 */
export async function ensureCharge(
  engine: SyncEngine,
  charge: Charge,
  honorarios: readonly Row[],
  extra: Record<string, Value> = {},
): Promise<void> {
  if (charge.row) {
    if (Object.keys(extra).length) await engine.mutate('Cobros', 'update', charge.id, extra);
    return;
  }
  const fee = honorarios.find((f) => f.id === charge.honorarioId);
  if (!fee || !charge.periodo) return;
  await engine.mutate('Cobros', 'create', charge.id, {
    ...periodFields(fee, { periodo: charge.periodo, fecha: charge.fechaEmision }),
    ...extra,
  });
}

/** A number typed in a form: empty is null; anything else must be a number. */
export function parseAmount(value: string): number | null | 'invalid' {
  const clean = value.trim().replace(/[\s,$]/g, '');
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : 'invalid';
}

/** A number as a form shows it (empty for none). */
export const amountText = (value: Value | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
