/**
 * Test doubles of the advanced Calendar service and of MailApp, faithful
 * where the portal relies on them:
 * - every change gets a number; `list` with a sync token returns what
 *   changed after it, deleted events included (status "cancelled"), and a
 *   token the fake no longer knows asks for a full sync, as Google does;
 * - a deleted event stays as "cancelled"; patching one brings it back;
 * - people can move or delete events "in Google" (`userMove`, `userDelete`);
 * - MailApp counts recipients against the day's quota and refuses beyond it.
 * Only tests import this file.
 */
import { randomUUID } from 'node:crypto';
import type {
  GAclRule,
  GCalendarEvent,
  GCalendarEventList,
  GCalendarService,
  GMailMessage,
} from '../google.ts';

interface FakeCalendarData {
  id: string;
  summary: string;
  timeZone: string;
  events: Map<string, GCalendarEvent & { changed: number }>;
  acl: Map<string, GAclRule>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class FakeCalendar implements GCalendarService {
  readonly calendars = new Map<string, FakeCalendarData>();
  /** Calls by method, to prove what a run did (and did not) ask Google. */
  readonly calls: Record<string, number> = {};
  #clock = 0;
  /** Tokens issued before this change number are "too old": a full sync is required. */
  oldestToken = 0;
  readonly #owner: string;

  constructor(owner = 'portal-owner@example.com') {
    this.#owner = owner;
  }

  #count(method: string): void {
    this.calls[method] = (this.calls[method] ?? 0) + 1;
  }

  #calendar(id: string): FakeCalendarData {
    const cal = this.calendars.get(id);
    if (!cal) throw new Error('API call to calendar failed with error: Not Found');
    return cal;
  }

  #tick(): number {
    this.#clock += 1;
    return this.#clock;
  }

  /** Every event of a calendar not deleted, as Google would show it. */
  live(calendarId: string): GCalendarEvent[] {
    return [...this.#calendar(calendarId).events.values()]
      .filter((e) => e.status !== 'cancelled')
      .map(({ changed: _c, ...e }) => clone(e));
  }

  /** Someone moves an event in Google Calendar. */
  userMove(
    calendarId: string,
    eventId: string,
    start: GCalendarEvent['start'],
    end: GCalendarEvent['end'],
  ): void {
    const ev = this.#calendar(calendarId).events.get(eventId);
    if (!ev) throw new Error(`No event ${eventId}`);
    ev.start = clone(start);
    ev.end = clone(end);
    ev.changed = this.#tick();
  }

  /** Someone renames or deletes an event in Google Calendar. */
  userEdit(calendarId: string, eventId: string, fields: Partial<GCalendarEvent>): void {
    const ev = this.#calendar(calendarId).events.get(eventId);
    if (!ev) throw new Error(`No event ${eventId}`);
    Object.assign(ev, clone(fields));
    ev.changed = this.#tick();
  }

  readonly Calendars = {
    insert: (resource: { summary: string; timeZone: string }): { id: string } => {
      this.#count('calendars.insert');
      const id = `cal-${randomUUID()}@group.calendar.google.com`;
      const acl = new Map<string, GAclRule>([
        [
          `user:${this.#owner}`,
          { id: `user:${this.#owner}`, role: 'owner', scope: { type: 'user', value: this.#owner } },
        ],
      ]);
      this.calendars.set(id, {
        id,
        summary: resource.summary,
        timeZone: resource.timeZone,
        events: new Map(),
        acl,
      });
      return { id };
    },
  };

  readonly Events = {
    list: (calendarId: string, params: Record<string, unknown>): GCalendarEventList => {
      this.#count('events.list');
      const cal = this.#calendar(calendarId);
      const token = typeof params.syncToken === 'string' ? Number(params.syncToken) : null;
      if (token !== null && (!Number.isInteger(token) || token < this.oldestToken)) {
        throw new Error(
          'API call to calendar.events.list failed with error: Sync token is no longer valid, a full sync is required.',
        );
      }
      const items = [...cal.events.values()]
        .filter((e) => (token === null ? e.status !== 'cancelled' : e.changed > token))
        .map(({ changed: _c, ...e }) => clone(e));
      return { items, nextSyncToken: String(this.#clock) };
    },
    insert: (resource: GCalendarEvent, calendarId: string): GCalendarEvent => {
      this.#count('events.insert');
      const cal = this.#calendar(calendarId);
      const id = randomUUID().replace(/-/g, '');
      const ev = { ...clone(resource), id, status: 'confirmed', changed: this.#tick() };
      cal.events.set(id, ev);
      const { changed: _c, ...out } = ev;
      return clone(out);
    },
    patch: (resource: GCalendarEvent, calendarId: string, eventId: string): GCalendarEvent => {
      this.#count('events.patch');
      const ev = this.#calendar(calendarId).events.get(eventId);
      if (!ev) throw new Error('API call to calendar.events.patch failed with error: Not Found');
      Object.assign(ev, clone(resource), { changed: this.#tick() });
      if (!resource.status && ev.status === 'cancelled') ev.status = 'confirmed';
      const { changed: _c, ...out } = ev;
      return clone(out);
    },
    remove: (calendarId: string, eventId: string): void => {
      this.#count('events.remove');
      const ev = this.#calendar(calendarId).events.get(eventId);
      if (!ev) throw new Error('API call to calendar.events.delete failed with error: Not Found');
      if (ev.status === 'cancelled') {
        throw new Error(
          'API call to calendar.events.delete failed with error: Resource has been deleted',
        );
      }
      ev.status = 'cancelled';
      ev.changed = this.#tick();
    },
  };

  readonly Acl = {
    list: (calendarId: string): { items: GAclRule[] } => {
      this.#count('acl.list');
      return { items: [...this.#calendar(calendarId).acl.values()].map(clone) };
    },
    insert: (resource: GAclRule, calendarId: string): GAclRule => {
      this.#count('acl.insert');
      const cal = this.#calendar(calendarId);
      const id = `${resource.scope?.type ?? 'user'}:${resource.scope?.value ?? ''}`;
      const rule = { ...clone(resource), id };
      cal.acl.set(id, rule);
      return clone(rule);
    },
    remove: (calendarId: string, ruleId: string): void => {
      this.#count('acl.remove');
      const cal = this.#calendar(calendarId);
      if (!cal.acl.delete(ruleId))
        throw new Error('API call to calendar.acl.delete failed with error: Not Found');
    },
  };
}

/** MailApp: what was sent, and the day's quota of recipients. */
export class FakeMail {
  readonly sent: GMailMessage[] = [];
  /** Recipients left today (a free account starts at 100). */
  quota = 100;
  /** Throws on the next send (a rejected address, an outage). */
  failNext: string | null = null;

  sendEmail(message: GMailMessage): void {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw new Error(error);
    }
    const recipients = message.to.split(',').filter((s) => s.trim()).length;
    if (recipients > this.quota) {
      throw new Error('Service invoked too many times for one day: email.');
    }
    this.quota -= recipients;
    this.sent.push(clone(message));
  }

  getRemainingDailyQuota(): number {
    return this.quota;
  }
}
