/**
 * What the compliance screens share: the firm's non-working days, the tone
 * of each state, a rule in words and the next dates of a rule.
 */
import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import {
  RIESGOS,
  addDays,
  nonWorkingDays,
  occurrencesBetween,
  parseRecurrence,
  type ObligationState,
  type Row,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { can } from '../../domain/access.ts';
import { languageTag } from '../../i18n/index.ts';
import { oneOf } from '../../i18n/labels.ts';
import { usePortal } from '../../session/context.ts';
import type { Tone } from '../../ui/StatusBadge.tsx';

/** Who may send evidence for a client's obligation: the firm and the client's admins and collaborators. */
export function useMaySendEvidence(clientId: string | null): boolean {
  const { me } = usePortal();
  return can(me, 'CumplimientosHistorial', 'create', clientId);
}

/** The days the firm marked as non-working (everyone receives them). */
export function useNonWorkingDays(): ReadonlySet<string> {
  const rows = useRows('DiasInhabiles');
  return useMemo(() => nonWorkingDays(rows ?? []), [rows]);
}

export const STATE_TONE: Record<ObligationState, Tone> = {
  cumplido: 'success',
  revision: 'info',
  vencido: 'danger',
  porVencer: 'warning',
  pendiente: 'neutral',
  cumplida: 'success',
  inactiva: 'neutral',
  sinFecha: 'neutral',
};

export const RISK_TONE: Record<(typeof RIESGOS)[number], Tone> = {
  ALTO: 'danger',
  MEDIO: 'warning',
  BAJO: 'neutral',
};

export const riskOf = (row: Row): (typeof RIESGOS)[number] | null =>
  oneOf(RIESGOS, row.riesgo) ? row.riesgo : null;

/** "agosto" / "August". */
export function monthName(month: number, style: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(languageTag(), { month: style, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, month - 1, 15)),
  );
}

/** "agosto de 2026" for "2026-08". */
export function monthOfYear(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(languageTag(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}

/** An obligation's rule in words: "Cada mes, el día 12". */
export function describeRule(t: TFunction, rule: string | null): string {
  if (!rule) return t('compliance.rule.once');
  const r = parseRecurrence(rule);
  if (!r) return t('compliance.rule.unknown');
  if (r.freq === 'MONTHLY') {
    return r.day === -1
      ? t('compliance.rule.monthlyLast', { count: r.interval })
      : t('compliance.rule.monthly', { count: r.interval, day: r.day });
  }
  const month = monthName(r.month ?? 1);
  return r.day === -1
    ? t('compliance.rule.yearlyLast', { count: r.interval, month })
    : t('compliance.rule.yearly', { count: r.interval, day: r.day, month });
}

/**
 * The next dates of a rule from a date (the date included), keeping step
 * with `anchor`; none without a rule the portal reads.
 */
export function nextDates(
  rule: string | null,
  anchor: string,
  from: string,
  count: number,
): string[] {
  const r = parseRecurrence(rule);
  if (!r) return [];
  const span = (r.freq === 'YEARLY' ? 366 : 31) * r.interval * (count + 1);
  return occurrencesBetween(r, anchor, from, addDays(from, span)).slice(0, count);
}
