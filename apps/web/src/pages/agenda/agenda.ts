/**
 * The agenda on the device: the same items the Google calendars, the
 * personal feed and the daily summary are made of (shared `agendaItems`),
 * from the rows in view (the client and unit chosen above), so it works
 * offline and shows each person only what they may see.
 */
import { useMemo } from 'react';
import {
  DEFAULT_FATAL_REMINDERS,
  DEFAULT_GENERAL_REMINDERS,
  addDays,
  agendaItems,
  parseDays,
  type AgendaItem,
} from '@empirica/shared';
import { API_URL } from '../../config/api.ts';
import { todayInCancun } from '../../domain/deadlines.ts';
import { useScopedRows } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { useNonWorkingDays } from '../compliance/compliance.ts';

/** How far the page looks back (overdue) and ahead. */
export const AGENDA_BACK_DAYS = 60;
export const AGENDA_AHEAD_DAYS = 120;

export type AgendaFilter = 'all' | 'deadlines' | 'appointments';

export function useAgenda(): { items: AgendaItem[] | undefined; today: string } {
  const { me } = usePortal();
  const tareas = useScopedRows('Tareas');
  const obligaciones = useScopedRows('Obligaciones');
  const cumplimientos = useScopedRows('CumplimientosHistorial');
  const tramites = useScopedRows('Tramites');
  const contratos = useScopedRows('Contratos');
  const eventos = useScopedRows('Eventos');
  const inhabiles = useNonWorkingDays();
  const today = todayInCancun();
  const general = me.config.diasAlertaGeneral;
  const fatal = me.config.diasAlertaFatal;
  const items = useMemo(() => {
    if (!tareas || !obligaciones || !cumplimientos || !tramites || !contratos || !eventos) {
      return undefined;
    }
    return agendaItems(
      {
        Tareas: tareas,
        Obligaciones: obligaciones,
        CumplimientosHistorial: cumplimientos,
        Tramites: tramites,
        Contratos: contratos,
        Eventos: eventos,
      },
      {
        today,
        from: addDays(today, -AGENDA_BACK_DAYS),
        to: addDays(today, AGENDA_AHEAD_DAYS),
        inhabiles,
        general: parseDays(general, DEFAULT_GENERAL_REMINDERS),
        fatal: parseDays(fatal, DEFAULT_FATAL_REMINDERS),
      },
    );
  }, [
    tareas,
    obligaciones,
    cumplimientos,
    tramites,
    contratos,
    eventos,
    inhabiles,
    today,
    general,
    fatal,
  ]);
  return { items, today };
}

export interface AgendaDay {
  date: string;
  items: AgendaItem[];
}

const matches = (item: AgendaItem, filter: AgendaFilter): boolean =>
  filter === 'all' || (filter === 'deadlines') === (item.tipo === 'VENCIMIENTO');

/**
 * Overdue deadlines first (past appointments are history and are not
 * listed), then each day from today on.
 */
export function groupAgenda(
  items: readonly AgendaItem[],
  today: string,
  filter: AgendaFilter,
): { overdue: AgendaItem[]; days: AgendaDay[] } {
  const overdue: AgendaItem[] = [];
  const days = new Map<string, AgendaItem[]>();
  for (const item of items) {
    if (!matches(item, filter)) continue;
    if (item.date < today) {
      if (item.tipo === 'VENCIMIENTO' && !item.enRevision) overdue.push(item);
      continue;
    }
    days.set(item.date, [...(days.get(item.date) ?? []), item]);
  }
  return {
    overdue,
    days: [...days.entries()].map(([date, list]) => ({ date, items: list })),
  };
}

/** The personal feed's address for a secret (absolute, also in the demo). */
export function feedUrl(token: string): string {
  const base = new URL(API_URL, location.href).href;
  return `${base}${base.includes('?') ? '&' : '?'}action=ics&token=${token}`;
}

/** The same address for calendar apps that subscribe to webcal:// links. */
export const webcalUrl = (url: string): string => url.replace(/^https?:/, 'webcal:');

/** Google Calendar, ready to subscribe to a feed by its address. */
export const googleSubscribeUrl = (url: string): string =>
  `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(url))}`;
