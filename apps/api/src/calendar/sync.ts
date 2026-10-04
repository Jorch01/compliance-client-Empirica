/**
 * Keeps the portal's Google calendars in step with the agenda (a trigger
 * every 15 minutes, created by setup()):
 *
 * 1. What changed in Google since the last run (its sync token). An
 *    appointment moved in the firm's calendar comes back to the portal. A
 *    deadline moved, renamed or deleted there is written back as the portal
 *    has it, and the person responsible is told (CALENDARIO_REVERTIDO).
 * 2. What the portal says now: new events, changed ones, and the ones whose
 *    item is gone (deleted, done). Items that fall more than 90 days in the
 *    past simply stay in Google as history.
 * 3. Access: whoever no longer qualifies loses it (acl.ts).
 *
 * Google is called without the script lock; only the portal's records (a
 * moved appointment, the notes of the bell) are written under it. A run
 * stops after its time budget; the next one continues from what it saved.
 */
import {
  AGENDA_FUTURE_DAYS,
  AGENDA_PAST_DAYS,
  PROJECT_TIME_ZONE,
  RECORD_PATH,
  addDays,
  agendaTitle,
  text,
  toProjectDate,
  toProjectIso,
  type AgendaItem,
  type Row,
  type Value,
} from '@empirica/shared';
import { changed, underLock } from '../actions/locked.ts';
import { readAgendaSettings } from '../config.ts';
import { Database } from '../db/database.ts';
import type { SheetTable } from '../db/table.ts';
import { PROP, type Env } from '../env.ts';
import type { GCalendarEvent, GCalendarService } from '../google.ts';
import { saveNotifications, type NotificationDraft } from '../notify.ts';
import { reconcileAccess } from './acl.ts';
import { agendaFor, agendaRows, firmReader, namesOf, wholeClientReader } from './agenda.ts';
import { FIRM_CALENDAR, desiredEvent, timesOf, type DesiredEvent } from './events.ts';

/** Apps Script stops a run at 6 minutes: this leaves time to save what was done. */
export const CALENDAR_BUDGET_MS = 240_000;
/** Who the portal's own changes are logged as. */
export const CALENDAR_ACTOR = 'calendario';
const RUNNING_KEY = 'calendar:running';
const PAGE_SIZE = 250;

export interface CalendarSyncReport {
  /** Why nothing was done: Calendar not authorized yet, or another run going. */
  skipped: string | null;
  calendars: number;
  inserted: number;
  patched: number;
  deleted: number;
  /** Appointments moved in Google that came back to the portal. */
  moved: number;
  /** Deadlines changed in Google that went back as the portal has them. */
  reverted: number;
  /** Access taken away. */
  revoked: number;
  failed: number;
  /** The time budget ran out: the next run continues. */
  partial: boolean;
}

const emptyReport = (): CalendarSyncReport => ({
  skipped: null,
  calendars: 0,
  inserted: 0,
  patched: 0,
  deleted: 0,
  moved: 0,
  reverted: 0,
  revoked: 0,
  failed: 0,
  partial: false,
});

/** The advanced Calendar service, or null while it is not enabled and authorized. */
export function calendarService(env: Env): GCalendarService | null {
  return env.g.Calendar ?? null;
}

/** The firm's calendar, created the first time it is needed. */
export function firmCalendarId(env: Env, cal: GCalendarService): string {
  const known = env.prop(PROP.firmCalendarId);
  if (known) return known;
  const created = cal.Calendars.insert({
    summary: 'Empírica · Despacho',
    timeZone: PROJECT_TIME_ZONE,
    description: 'Vencimientos y citas de todos los clientes. Lo escribe el portal.',
  });
  if (!created.id) throw new Error('Google no devolvió el calendario creado.');
  env.setProp(PROP.firmCalendarId, created.id);
  return created.id;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const isSyncExpired = (error: unknown): boolean =>
  /full sync is required|sync token is no longer valid|\b410\b/i.test(messageOf(error));
const isNotFound = (error: unknown): boolean => /not found|\b404\b/i.test(messageOf(error));
const isGone = (error: unknown): boolean =>
  isNotFound(error) || /has been deleted|\b410\b/i.test(messageOf(error));

/** The events changed since `token` (all of them without one, or once it expired). */
function listChanges(
  cal: GCalendarService,
  googleId: string,
  token: string | undefined,
): { events: GCalendarEvent[]; nextSyncToken: string | null; full: boolean } {
  let full = !token;
  const events: GCalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let guard = 0; guard < 200; guard++) {
    const params: Record<string, unknown> = {
      maxResults: PAGE_SIZE,
      ...(full ? { showDeleted: false } : { syncToken: token }),
      ...(pageToken ? { pageToken } : {}),
    };
    let page;
    try {
      page = cal.Events.list(googleId, params);
    } catch (error) {
      if (full || !isSyncExpired(error)) throw error;
      // Google forgot the token: read everything again.
      full = true;
      events.length = 0;
      pageToken = undefined;
      continue;
    }
    events.push(...(page.items ?? []));
    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
      continue;
    }
    return { events, nextSyncToken: page.nextSyncToken ?? null, full };
  }
  return { events, nextSyncToken: null, full };
}

/** The Calendario tab, by calendar and key; written once at the end. */
class CalendarMap {
  readonly #table: SheetTable;
  readonly #env: Env;
  readonly #rows = new Map<string, Row>();
  readonly #dirty = new Set<string>();
  #removed = false;

  constructor(db: Database) {
    this.#env = db.env;
    this.#table = db.table('Calendario');
    for (const r of this.#table.all()) {
      if (!r.deleted) this.#rows.set(`${text(r, 'calendario') ?? ''}|${text(r, 'clave') ?? ''}`, r);
    }
  }

  get(calendario: string, clave: string): Row | undefined {
    return this.#rows.get(`${calendario}|${clave}`);
  }

  of(calendario: string): Row[] {
    return [...this.#rows.values()].filter((r) => r.calendario === calendario);
  }

  calendars(): Set<string> {
    return new Set([...this.#rows.values()].map((r) => text(r, 'calendario') ?? ''));
  }

  set(calendario: string, clave: string, fields: Record<string, Value>): void {
    const key = `${calendario}|${clave}`;
    const now = toProjectIso(this.#env.now());
    const before = this.#rows.get(key);
    this.#rows.set(key, {
      ...(before ?? {
        id: this.#env.uuid(),
        createdAt: now,
        createdBy: CALENDAR_ACTOR,
        version: 0,
        deleted: null,
        calendario,
        clave,
      }),
      ...fields,
      updatedAt: now,
      updatedBy: CALENDAR_ACTOR,
      version: (typeof before?.version === 'number' ? before.version : 0) + 1,
    });
    this.#dirty.add(key);
  }

  remove(row: Row): void {
    this.#rows.delete(`${text(row, 'calendario') ?? ''}|${text(row, 'clave') ?? ''}`);
    this.#removed = true;
  }

  save(): void {
    for (const key of this.#dirty) {
      const row = this.#rows.get(key);
      if (row) this.#table.put(row);
    }
    this.#table.flush();
    if (this.#removed) this.#table.replaceAll([...this.#rows.values()]);
  }
}

interface Move {
  id: string;
  times: { inicio: string; fin: string };
  allDay: boolean;
}

function readTokens(env: Env): Record<string, string> {
  try {
    const parsed = JSON.parse(env.prop(PROP.calendarSync) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Who hears about a deadline put back: its responsible person, else the client's lawyer. */
function revertDraft(db: Database, item: AgendaItem): NotificationDraft {
  const firmUser = (id: string | null): string | null => {
    const u = id ? db.table('Usuarios').get(id) : undefined;
    return u?.lado === 'EMPIRICA' ? u.id : null;
  };
  const client = item.clienteId ? db.table('Clientes').get(item.clienteId) : undefined;
  const row = db.table(item.table).get(item.id);
  return {
    usuarioId:
      firmUser(item.responsableId) ??
      (client ? firmUser(text(client, 'abogadoResponsableId')) : null),
    tipo: 'CALENDARIO_REVERTIDO',
    about: row ? { table: item.table, row } : null,
    mensaje: agendaTitle(item),
    link: `${RECORD_PATH[item.table]}/${item.id}`,
    clienteId: item.clienteId,
  };
}

export function syncCalendars(env: Env, budgetMs = CALENDAR_BUDGET_MS): CalendarSyncReport {
  const report = emptyReport();
  const cal = calendarService(env);
  if (!cal) return { ...report, skipped: 'CALENDAR_NOT_AUTHORIZED' };
  if (env.cacheGet(RUNNING_KEY)) return { ...report, skipped: 'RUNNING' };
  env.cachePut(RUNNING_KEY, '1', 600);
  const started = env.now();
  const outOfTime = (): boolean => env.now() - started > budgetMs;
  try {
    let db = new Database(env);
    const settings = readAgendaSettings(db.rows('Config'));
    const today = toProjectDate(env.now());
    const window = {
      from: addDays(today, -AGENDA_PAST_DAYS),
      to: addDays(today, AGENDA_FUTURE_DAYS),
    };
    const calendars = [
      { calendario: FIRM_CALENDAR, googleId: firmCalendarId(env, cal) },
      ...db
        .rows('Clientes')
        .filter((c) => !c.deleted && text(c, 'calendarId'))
        .map((c) => ({ calendario: c.id, googleId: text(c, 'calendarId') ?? '' })),
    ];
    report.calendars = calendars.length;
    const mapping = new CalendarMap(db);
    const tokens = readTokens(env);

    // 1. What changed in Google.
    const moves: Move[] = [];
    const reverts = new Set<string>();
    for (const c of calendars) {
      const { events, nextSyncToken, full } = listChanges(cal, c.googleId, tokens[c.googleId]);
      const seen = new Set<string>();
      for (const ev of events) {
        const clave = ev.extendedProperties?.private?.clave;
        if (!clave || !ev.id) continue; // someone's own event: never touched
        const m = mapping.get(c.calendario, clave);
        if (!m) {
          // Ours, but forgotten (the tab was edited by hand): adopt it.
          if (ev.status !== 'cancelled') {
            seen.add(ev.id);
            mapping.set(c.calendario, clave, { eventId: ev.id, hash: '', titulo: '' });
          }
          continue;
        }
        if (m.eventId !== ev.id) {
          // A second copy of the same item: one is enough.
          if (ev.status !== 'cancelled') {
            try {
              cal.Events.remove(c.googleId, ev.id);
            } catch (error) {
              if (!isGone(error)) report.failed++;
            }
          }
          continue;
        }
        seen.add(ev.id);
        if (ev.status === 'cancelled') {
          // Deleted in Google: the portal still has it, so it comes back.
          mapping.set(c.calendario, clave, { hash: '' });
          if (c.calendario === FIRM_CALENDAR) reverts.add(clave);
          continue;
        }
        const times = timesOf(ev);
        if (times && (times.inicio !== m.inicio || times.fin !== m.fin)) {
          if (c.calendario === FIRM_CALENDAR && clave.startsWith('Eventos:')) {
            moves.push({
              id: clave.slice('Eventos:'.length),
              times,
              allDay: Boolean(ev.start?.date),
            });
          } else if (c.calendario === FIRM_CALENDAR) {
            reverts.add(clave);
          }
          mapping.set(c.calendario, clave, { hash: '' });
        } else if ((ev.summary ?? '') !== text(m, 'titulo')) {
          mapping.set(c.calendario, clave, { hash: '' });
        }
      }
      if (full) {
        // A full read: what is not there any more is written again.
        for (const m of mapping.of(c.calendario)) {
          if (!seen.has(text(m, 'eventId') ?? '')) {
            mapping.set(c.calendario, text(m, 'clave') ?? '', { eventId: '', hash: '' });
          }
        }
      }
      if (nextSyncToken) tokens[c.googleId] = nextSyncToken;
    }

    // Appointments moved in the firm's calendar come back to the portal.
    if (moves.length) {
      underLock(env, CALENDAR_ACTOR, (r) => {
        for (const mv of moves) {
          const row = r.db.table('Eventos').get(mv.id);
          if (!row || row.deleted || row.tipo === 'VENCIMIENTO') {
            reverts.add(`Eventos:${mv.id}`);
            continue;
          }
          const after = changed(
            r,
            row,
            mv.allDay
              ? { inicio: `${mv.times.inicio}T00:00:00.000-05:00`, fin: null, todoElDia: true }
              : {
                  inicio: toProjectIso(Date.parse(mv.times.inicio)),
                  fin: toProjectIso(Date.parse(mv.times.fin)),
                  todoElDia: false,
                },
          );
          if (after === row) continue;
          r.writer.save('Eventos', row, after);
          r.writer.audit(
            'EDITAR',
            'Eventos',
            row.id,
            text(row, 'clienteId'),
            { inicio: row.inicio ?? null, fin: row.fin ?? null },
            { inicio: after.inicio ?? null, fin: after.fin ?? null, origen: 'Google Calendar' },
          );
          report.moved++;
        }
      });
      db = new Database(env);
    }

    // 2. What the portal says now, calendar by calendar.
    const rows = agendaRows(db);
    const names = namesOf(db);
    const context = (i: AgendaItem): string | null =>
      [names.client(i.clienteId), names.unit(i.entidadId)].filter(Boolean).join(' · ') || null;
    const firmItems = agendaFor(firmReader(db), db, rows, today, settings, window);
    const desired = new Map<string, Map<string, DesiredEvent>>([
      [
        FIRM_CALENDAR,
        new Map(
          firmItems.map((i) => [
            i.key,
            desiredEvent(i, settings.portalUrl, names.client(i.clienteId), context(i)),
          ]),
        ),
      ],
    ]);
    for (const c of calendars) {
      if (c.calendario === FIRM_CALENDAR) continue;
      const items = agendaFor(wholeClientReader(c.calendario), db, rows, today, settings, window);
      desired.set(
        c.calendario,
        new Map(
          items.map((i) => [
            i.key,
            desiredEvent(i, settings.portalUrl, names.unit(i.entidadId), names.unit(i.entidadId)),
          ]),
        ),
      );
    }

    write: for (const c of calendars) {
      const want = desired.get(c.calendario) ?? new Map<string, DesiredEvent>();
      for (const d of want.values()) {
        const m = mapping.get(c.calendario, d.key);
        if (m && text(m, 'eventId') && m.hash === d.hash) continue;
        if (outOfTime()) {
          report.partial = true;
          break write;
        }
        try {
          const eventId = m ? text(m, 'eventId') : null;
          let saved: GCalendarEvent | null = null;
          if (eventId) {
            try {
              saved = cal.Events.patch(d.event, c.googleId, eventId);
              report.patched++;
            } catch (error) {
              if (!isNotFound(error)) throw error;
            }
          }
          if (!saved) {
            saved = cal.Events.insert(d.event, c.googleId);
            report.inserted++;
          }
          mapping.set(c.calendario, d.key, {
            eventId: saved.id ?? '',
            hash: d.hash,
            inicio: d.inicio,
            fin: d.fin,
            titulo: d.titulo,
          });
        } catch (error) {
          report.failed++;
          env.log('Calendar: no se pudo escribir un evento', {
            calendario: c.calendario,
            clave: d.key,
            error: messageOf(error),
          });
        }
      }
      for (const m of mapping.of(c.calendario)) {
        if (want.has(text(m, 'clave') ?? '')) continue;
        // Past the window: it stays in Google as history, and here it is forgotten.
        if ((text(m, 'inicio') ?? '').slice(0, 10) < window.from) {
          mapping.remove(m);
          continue;
        }
        if (outOfTime()) {
          report.partial = true;
          break write;
        }
        const eventId = text(m, 'eventId');
        try {
          if (eventId) cal.Events.remove(c.googleId, eventId);
          report.deleted++;
        } catch (error) {
          if (!isGone(error)) {
            report.failed++;
            continue;
          }
        }
        mapping.remove(m);
      }
    }
    // Calendars that are no longer the portal's (a client deleted): forget them.
    const live = new Set(calendars.map((c) => c.calendario));
    for (const name of mapping.calendars()) {
      if (!live.has(name)) for (const m of mapping.of(name)) mapping.remove(m);
    }

    // 3. Access.
    try {
      report.revoked = reconcileAccess(cal, db, calendars);
    } catch (error) {
      report.failed++;
      env.log('Calendar: no se pudo revisar quién ve los calendarios', { error: messageOf(error) });
    }

    mapping.save();
    env.setProp(PROP.calendarSync, JSON.stringify(tokens));

    if (reverts.size) {
      const byKey = new Map(firmItems.map((i) => [i.key, i]));
      const drafts = [...reverts]
        .map((k) => byKey.get(k))
        .filter((i): i is AgendaItem => Boolean(i))
        .map((i) => revertDraft(db, i));
      report.reverted = reverts.size;
      if (drafts.length) {
        try {
          underLock(env, CALENDAR_ACTOR, (r) => {
            saveNotifications(r.db, r.writer, drafts, null);
          });
        } catch (error) {
          // The calendars are right already; only the notes could not be written.
          env.log('Calendar: no se pudo avisar', { error: messageOf(error) });
        }
      }
    }
    if (report.failed || report.moved || report.reverted || report.revoked) {
      env.log('Calendarios', report);
    }
    return report;
  } finally {
    env.cachePut(RUNNING_KEY, '', 1);
  }
}
