/**
 * Everything with a date, in one list: the deadlines of tasks, of the
 * obligations' periods, of filings and of contracts, and the appointments
 * (`Eventos`). The portal's agenda, the personal calendar feed (ICS), the
 * Google calendars and the daily summary all read it from here, so they
 * never disagree.
 *
 * It works on the rows it is given: whoever calls it filters them first by
 * what the reader may see (canRead), exactly as the sync does.
 */
import { parseInstant, toProjectDate } from '../time.ts';
import { periodsOf } from './compliance.ts';
import { noticeDeadline } from './contracts.ts';
import { isOpenFiling } from './filings.ts';
import { addDays } from './recurrence.ts';
import { text, type Row } from './values.ts';

export const AGENDA_SOURCES = [
  'Tareas',
  'Obligaciones',
  'Tramites',
  'Contratos',
  'Eventos',
] as const;
export type AgendaSource = (typeof AGENDA_SOURCES)[number];

export type AgendaKind = 'VENCIMIENTO' | 'AUDIENCIA' | 'CITA' | 'REUNION';

/** Which date of a record with several: a filing's or a contract's. */
export type AgendaDetail = 'fechaLimite' | 'proximaActuacion' | 'aviso' | 'vencimiento';

export interface AgendaItem {
  /** Stable from run to run: the calendar event and the feed's UID come from it. */
  key: string;
  table: AgendaSource;
  /** The record it comes from. */
  id: string;
  clienteId: string | null;
  entidadId: string | null;
  visibilidad: 'INTERNO' | 'COMPARTIDO';
  tipo: AgendaKind;
  /** A fatal deadline (tasks marked `esFatal`). */
  fatal: boolean;
  detalle: AgendaDetail | null;
  /** The record's own name, as typed. */
  titulo: string;
  /** The day it falls on, in Cancún. */
  date: string;
  /** Timed appointments: start and end; null for whole days. */
  start: string | null;
  end: string | null;
  /** Days before, to remind (D14). */
  reminders: number[];
  /** Appointments may be moved from Google Calendar; deadlines change only in the portal. */
  movable: boolean;
  /** Waiting for the firm's review: the other side already did its part. */
  enRevision: boolean;
  responsableId: string | null;
  /** An obligation's period (its key in CumplimientosHistorial). */
  periodo: string | null;
}

export interface AgendaData {
  Tareas?: readonly Row[];
  Obligaciones?: readonly Row[];
  CumplimientosHistorial?: readonly Row[];
  Tramites?: readonly Row[];
  Contratos?: readonly Row[];
  Eventos?: readonly Row[];
}

export interface AgendaOptions {
  /** "YYYY-MM-DD" in Cancún. */
  today: string;
  /** First day included (default: 90 days ago). */
  from?: string;
  /** Last day included (default: a year ahead). */
  to?: string;
  inhabiles?: ReadonlySet<string>;
  /** Days before a deadline to remind (Config `diasAlertaGeneral`). */
  general?: readonly number[];
  /** Days before a fatal deadline (Config `diasAlertaFatal`). */
  fatal?: readonly number[];
}

export const DEFAULT_GENERAL_REMINDERS: readonly number[] = [7, 1];
export const DEFAULT_FATAL_REMINDERS: readonly number[] = [15, 7, 3, 1];
/** How far back and ahead the agenda reaches by default. */
export const AGENDA_PAST_DAYS = 90;
export const AGENDA_FUTURE_DAYS = 365;

/** Where each kind of record opens in the portal. */
export const RECORD_PATH: Record<AgendaSource, string> = {
  Tareas: '/tareas',
  Obligaciones: '/compliance',
  Tramites: '/tramites',
  Contratos: '/contratos',
  Eventos: '/agenda',
};

/** "7,1" (a Config value) as days, largest first; the fallback when it says nothing usable. */
export function parseDays(value: string | null | undefined, fallback: readonly number[]): number[] {
  const days = (value ?? '')
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 366);
  return [...new Set(days.length ? days : fallback)].sort((a, b) => b - a);
}

const TIPOS: ReadonlySet<string> = new Set(['VENCIMIENTO', 'AUDIENCIA', 'CITA', 'REUNION']);
const HOUR_MS = 3_600_000;

const visibilityOf = (row: Row): AgendaItem['visibilidad'] =>
  row.visibilidad === 'INTERNO' ? 'INTERNO' : 'COMPARTIDO';

const dayOf = (value: string | null): string | null =>
  value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

/** The agenda: every dated item from `from` to `to`, by day and time. */
export function agendaItems(data: AgendaData, options: AgendaOptions): AgendaItem[] {
  const { today } = options;
  const from = options.from ?? addDays(today, -AGENDA_PAST_DAYS);
  const to = options.to ?? addDays(today, AGENDA_FUTURE_DAYS);
  const general = [...(options.general ?? DEFAULT_GENERAL_REMINDERS)];
  const fatalDays = [...(options.fatal ?? DEFAULT_FATAL_REMINDERS)];
  const inhabiles = options.inhabiles ?? new Set<string>();
  const inRange = (date: string): boolean => date >= from && date <= to;
  const out: AgendaItem[] = [];

  const base = (
    table: AgendaSource,
    row: Row,
  ): Pick<
    AgendaItem,
    'table' | 'id' | 'clienteId' | 'entidadId' | 'visibilidad' | 'responsableId'
  > => ({
    table,
    id: row.id,
    clienteId: text(row, 'clienteId'),
    entidadId: text(row, 'entidadId'),
    visibilidad: visibilityOf(row),
    responsableId: text(row, 'responsableId'),
  });

  const deadline = (
    table: AgendaSource,
    row: Row,
    date: string,
    extra: Partial<AgendaItem> & { key: string; titulo: string },
  ): void => {
    if (!inRange(date)) return;
    const fatal = extra.fatal ?? false;
    out.push({
      ...base(table, row),
      tipo: 'VENCIMIENTO',
      fatal,
      detalle: null,
      date,
      start: null,
      end: null,
      reminders: fatal ? fatalDays : general,
      movable: false,
      enRevision: false,
      periodo: null,
      ...extra,
    });
  };

  for (const t of data.Tareas ?? []) {
    if (t.deleted || t.estado === 'HECHO') continue;
    const date = dayOf(text(t, 'fechaLimite'));
    if (!date) continue;
    deadline('Tareas', t, date, {
      key: `Tareas:${t.id}`,
      titulo: text(t, 'titulo') ?? '',
      fatal: t.esFatal === true,
      enRevision: t.estado === 'EN_REVISION',
    });
  }

  const cumplimientos = data.CumplimientosHistorial ?? [];
  for (const o of data.Obligaciones ?? []) {
    for (const p of periodsOf(o, cumplimientos, from, to, today, inhabiles)) {
      if (p.estado === 'cumplido') continue;
      deadline('Obligaciones', o, p.vence, {
        key: `Obligaciones:${o.id}:${p.periodo}`,
        titulo: text(o, 'nombre') ?? '',
        enRevision: p.estado === 'revision',
        periodo: p.periodo,
      });
    }
  }

  for (const f of data.Tramites ?? []) {
    if (f.deleted || !isOpenFiling(f)) continue;
    for (const detalle of ['fechaLimite', 'proximaActuacion'] as const) {
      const date = dayOf(text(f, detalle));
      if (!date) continue;
      deadline('Tramites', f, date, {
        key: `Tramites:${f.id}:${detalle}`,
        titulo: text(f, 'titulo') ?? '',
        detalle,
      });
    }
  }

  for (const c of data.Contratos ?? []) {
    if (c.deleted) continue;
    const dates: [AgendaDetail, string | null][] = [
      ['aviso', noticeDeadline(c)],
      ['vencimiento', dayOf(text(c, 'vigenciaHasta'))],
    ];
    for (const [detalle, date] of dates) {
      if (!date) continue;
      deadline('Contratos', c, date, {
        key: `Contratos:${c.id}:${detalle}`,
        titulo: text(c, 'contraparte') ?? '',
        detalle,
      });
    }
  }

  for (const ev of data.Eventos ?? []) {
    if (ev.deleted) continue;
    const startMs = parseInstant(ev.inicio);
    if (startMs === null) continue;
    const date = toProjectDate(startMs);
    if (!inRange(date)) continue;
    const tipo = TIPOS.has(text(ev, 'tipo') ?? '') ? (text(ev, 'tipo') as AgendaKind) : 'REUNION';
    const allDay = ev.todoElDia === true;
    const endMs = parseInstant(ev.fin);
    out.push({
      ...base('Eventos', ev),
      key: `Eventos:${ev.id}`,
      tipo,
      fatal: false,
      detalle: null,
      titulo: text(ev, 'titulo') ?? '',
      date,
      start: allDay ? null : new Date(startMs).toISOString(),
      end: allDay
        ? null
        : new Date(endMs !== null && endMs > startMs ? endMs : startMs + HOUR_MS).toISOString(),
      // A hearing is reminded like a deadline; a meeting, the day before.
      reminders: tipo === 'CITA' || tipo === 'REUNION' ? [1] : general,
      movable: tipo !== 'VENCIMIENTO',
      enRevision: false,
      periodo: null,
    });
  }

  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.start ?? '').localeCompare(b.start ?? '') ||
      a.key.localeCompare(b.key),
  );
}

/** Days from `today` to the item's day; negative once it passed. */
export function daysUntil(item: Pick<AgendaItem, 'date'>, today: string): number {
  return Math.round(
    (Date.parse(`${item.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}
