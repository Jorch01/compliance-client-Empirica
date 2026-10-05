/**
 * The agenda as an iCalendar feed (RFC 5545): what Google Calendar, Outlook
 * and Apple Calendar subscribe to, and what the Google calendars of the
 * portal are written from. Titles and descriptions come from here too.
 *
 * Written by hand, without TextEncoder (Apps Script has none): lines are
 * folded at 75 octets counting UTF-8 bytes from code points.
 */
import { RECORD_PATH, type AgendaItem } from './agenda.ts';
import { addDays } from './recurrence.ts';

export type AgendaLanguage = 'es' | 'en';

const LABELS = {
  es: {
    VENCIMIENTO: 'Vence',
    FATAL: 'Plazo fatal',
    AUDIENCIA: 'Audiencia',
    CITA: 'Cita',
    REUNION: 'Reunión',
    Obligaciones: 'Cumplimiento',
    fechaLimite: 'Fecha límite',
    proximaActuacion: 'Próxima actuación',
    aviso: 'Último día para avisar',
    vencimiento: 'Fin de vigencia',
    interno: 'Interno: el cliente no lo ve.',
    open: 'Abrir en el portal',
  },
  en: {
    VENCIMIENTO: 'Due',
    FATAL: 'Fatal deadline',
    AUDIENCIA: 'Hearing',
    CITA: 'Appointment',
    REUNION: 'Meeting',
    Obligaciones: 'Compliance',
    fechaLimite: 'Deadline',
    proximaActuacion: 'Next step',
    aviso: 'Last day to give notice',
    vencimiento: 'End of term',
    interno: 'Internal: the client does not see it.',
    open: 'Open in the portal',
  },
} as const;

/** What kind of date it is, in words: "Plazo fatal", "Fin de vigencia", "Audiencia". */
export function agendaKindLabel(item: AgendaItem, lang: AgendaLanguage = 'es'): string {
  const l = LABELS[lang];
  if (item.tipo !== 'VENCIMIENTO') return l[item.tipo];
  if (item.detalle) return l[item.detalle];
  if (item.table === 'Obligaciones') return l.Obligaciones;
  return item.fatal ? l.FATAL : l.VENCIMIENTO;
}

/**
 * The title a calendar shows: "Plazo fatal: Contestar demanda". An
 * appointment keeps the name it was given. `prefix` names the client when
 * one calendar mixes several.
 */
export function agendaTitle(
  item: AgendaItem,
  lang: AgendaLanguage = 'es',
  prefix: string | null = null,
): string {
  const name = item.titulo || agendaKindLabel(item, lang);
  const title = item.tipo === 'VENCIMIENTO' ? `${agendaKindLabel(item, lang)}: ${name}` : name;
  return prefix ? `${prefix} · ${title}` : title;
}

/** The portal's page for the item: https://portal.empirica.mx/#/tareas/<id>. */
export function agendaUrl(portalUrl: string, item: Pick<AgendaItem, 'table' | 'id'>): string {
  return `${portalUrl.replace(/\/*$/, '/')}#${RECORD_PATH[item.table]}/${item.id}`;
}

/** The text under the title: what it is, whose, and the way to the portal. */
export function agendaDescription(
  item: AgendaItem,
  portalUrl: string,
  lang: AgendaLanguage = 'es',
  context: string | null = null,
): string {
  const l = LABELS[lang];
  return [
    context ? `${agendaKindLabel(item, lang)} · ${context}` : agendaKindLabel(item, lang),
    item.visibilidad === 'INTERNO' ? l.interno : null,
    `${l.open}: ${agendaUrl(portalUrl, item)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

const utf8Length = (codePoint: number): number =>
  codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;

/** Folds a content line at 75 octets, never inside a character (RFC 5545 § 3.1). */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = utf8Length(ch.codePointAt(0) ?? 0);
    if (bytes + n > limit) {
      parts.push(current);
      current = ch;
      bytes = n;
      // A continuation line starts with a space, which counts.
      limit = 74;
    } else {
      current += ch;
      bytes += n;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** TEXT values: backslash, semicolon, comma and line breaks escaped. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const icsDate = (day: string): string => day.replace(/-/g, '');
const icsInstant = (ms: number): string =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** A reminder `days` before: at 9:00 for a whole day, the same time for an appointment. */
function trigger(item: AgendaItem, days: number): string {
  if (item.start) return days > 0 ? `-P${String(days)}D` : '-PT30M';
  const hours = days * 24 - 9;
  return hours >= 0 ? `-PT${String(hours)}H` : `PT${String(-hours)}H`;
}

export interface IcsOptions {
  /** The calendar's name, as the subscriber sees it. */
  name: string;
  items: readonly AgendaItem[];
  /** DTSTAMP: when the feed was produced. */
  now: number;
  portalUrl: string;
  lang?: AgendaLanguage;
  /** A prefix for the title (the client's name, when the feed mixes clients). */
  prefixOf?: (item: AgendaItem) => string | null;
  /** The client and unit, for the description. */
  contextOf?: (item: AgendaItem) => string | null;
  /** The right side of every UID. */
  domain?: string;
}

/** The whole feed, CRLF-terminated. */
export function renderIcs(options: IcsOptions): string {
  const lang = options.lang ?? 'es';
  const domain = options.domain ?? 'portal.empirica.mx';
  const stamp = icsInstant(options.now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Empirica Legal Lab//Portal//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.name)}`,
    'X-WR-TIMEZONE:America/Cancun',
    'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
    'X-PUBLISHED-TTL:PT2H',
  ];
  for (const item of options.items) {
    const prefix = options.prefixOf?.(item) ?? null;
    const summary = agendaTitle(item, lang, prefix);
    const url = agendaUrl(options.portalUrl, item);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.key.replace(/[^A-Za-z0-9-]/g, '-')}@${domain}`,
      `DTSTAMP:${stamp}`,
    );
    if (item.start && item.end) {
      lines.push(
        `DTSTART:${icsInstant(Date.parse(item.start))}`,
        `DTEND:${icsInstant(Date.parse(item.end))}`,
        'TRANSP:OPAQUE',
      );
    } else {
      lines.push(
        `DTSTART;VALUE=DATE:${icsDate(item.date)}`,
        `DTEND;VALUE=DATE:${icsDate(addDays(item.date, 1))}`,
        'TRANSP:TRANSPARENT',
      );
    }
    lines.push(
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(agendaDescription(item, options.portalUrl, lang, options.contextOf?.(item) ?? null))}`,
      `URL:${url}`,
      `CATEGORIES:${escapeText(agendaKindLabel(item, lang))}`,
      'STATUS:CONFIRMED',
    );
    for (const days of item.reminders) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(summary)}`,
        `TRIGGER:${trigger(item, days)}`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
