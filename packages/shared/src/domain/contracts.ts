/**
 * The dates that matter in a contract (`Contratos`): the end of its term and
 * the last day to give notice before it (`diasAvisoPrevio` days earlier),
 * which decides whether a contract that renews by itself does.
 */
import { addDays } from './recurrence.ts';
import { text, type Row } from './values.ts';

/** The last day to give notice: `vigenciaHasta` minus `diasAvisoPrevio`. */
export function noticeDeadline(contrato: Row): string | null {
  const end = text(contrato, 'vigenciaHasta');
  const days = contrato.diasAvisoPrevio;
  if (!end || typeof days !== 'number' || !Number.isInteger(days) || days <= 0) return null;
  return addDays(end, -days);
}

export type KeyDateKind = 'aviso' | 'vencimiento';

export interface KeyDate {
  date: string;
  kind: KeyDateKind;
}

/**
 * The contract's next key date from `today`: the notice deadline while it
 * is ahead, then the end of the term. Null once both passed, or without
 * dates.
 */
export function nextKeyDate(contrato: Row, today: string): KeyDate | null {
  const aviso = noticeDeadline(contrato);
  const end = text(contrato, 'vigenciaHasta');
  if (aviso && aviso >= today) return { date: aviso, kind: 'aviso' };
  if (end && end >= today) return { date: end, kind: 'vencimiento' };
  return null;
}

export type ContractStatus =
  /** Without an end date. */
  | 'indefinido'
  /** In force. */
  | 'vigente'
  /** The term ended and it renews by itself: its new end date is missing. */
  | 'renovado'
  /** The term ended. */
  | 'vencido';

export function contractStatus(contrato: Row, today: string): ContractStatus {
  const end = text(contrato, 'vigenciaHasta');
  if (!end) return 'indefinido';
  if (end >= today) return 'vigente';
  return contrato.renovacionAutomatica === true ? 'renovado' : 'vencido';
}
