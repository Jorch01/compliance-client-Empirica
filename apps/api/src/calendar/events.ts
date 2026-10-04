/**
 * What each portal calendar should hold: one Google event per agenda item,
 * written from the same titles and links as the personal feed, with a
 * fingerprint that tells whether the event in Google is still current.
 *
 * - The firm's calendar (DESPACHO): everything of every client, internal
 *   records too, each title led by the client's name.
 * - A client's calendar: what a user of the whole client sees, each title
 *   led by its unit's name when it has one.
 */
import {
  PROJECT_TIME_ZONE,
  addDays,
  agendaDescription,
  agendaTitle,
  agendaUrl,
  fingerprint,
  parseInstant,
  type AgendaItem,
} from '@empirica/shared';
import type { GCalendarEvent } from '../google.ts';

export const FIRM_CALENDAR = 'DESPACHO';

/** A whole day is reminded at 9:00 (540 minutes after its start, the night before). */
const MORNING_MINUTES = 540;
/** Google accepts reminders up to four weeks ahead, and five of them. */
const MAX_REMINDER_MINUTES = 40_320;
const MAX_REMINDERS = 5;

export interface DesiredEvent {
  key: string;
  item: AgendaItem;
  event: GCalendarEvent;
  hash: string;
  inicio: string;
  fin: string;
  titulo: string;
}

function minutesBefore(item: AgendaItem, days: number): number {
  const minutes = item.start ? days * 1440 : days * 1440 - MORNING_MINUTES;
  return Math.max(0, Math.min(MAX_REMINDER_MINUTES, minutes));
}

/** An event's times, comparable with what was written: dates, or instants in UTC. */
export function timesOf(event: GCalendarEvent): { inicio: string; fin: string } | null {
  const start = event.start;
  if (start?.date) return { inicio: start.date, fin: event.end?.date ?? addDays(start.date, 1) };
  const s = parseInstant(start?.dateTime);
  if (s === null) return null;
  const e = parseInstant(event.end?.dateTime) ?? s;
  return { inicio: new Date(s).toISOString(), fin: new Date(e).toISOString() };
}

export function desiredEvent(
  item: AgendaItem,
  portalUrl: string,
  prefix: string | null,
  context: string | null,
): DesiredEvent {
  const titulo = agendaTitle(item, 'es', prefix);
  const event: GCalendarEvent = {
    status: 'confirmed',
    summary: titulo,
    description: agendaDescription(item, portalUrl, 'es', context),
    start: item.start ? { dateTime: item.start, timeZone: PROJECT_TIME_ZONE } : { date: item.date },
    end: item.end
      ? { dateTime: item.end, timeZone: PROJECT_TIME_ZONE }
      : { date: addDays(item.date, 1) },
    transparency: item.start ? 'opaque' : 'transparent',
    source: { title: 'Empírica Portal', url: agendaUrl(portalUrl, item) },
    reminders: {
      useDefault: false,
      overrides: item.reminders
        .slice(0, MAX_REMINDERS)
        .map((days) => ({ method: 'popup', minutes: minutesBefore(item, days) })),
    },
    extendedProperties: { private: { clave: item.key } },
  };
  const times = timesOf(event) ?? { inicio: item.date, fin: item.date };
  return { key: item.key, item, event, hash: fingerprint(event), titulo, ...times };
}
