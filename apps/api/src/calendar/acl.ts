/**
 * Who sees the portal's Google calendars in their own Google Calendar
 * (`calendar.share`, by their own request):
 * - the firm's calendar: active firm users, who may also move appointments
 *   there (writer);
 * - a client's calendar: active users of that client whose access covers
 *   the whole client (reader). A user limited to some units, or to some
 *   matters, uses the personal feed instead: it shows exactly their part.
 * Every sync takes the access away from whoever no longer qualifies
 * (deactivated, membership withdrawn or narrowed); nobody else is ever
 * added by the portal.
 */
import { parseAlcance, text } from '@empirica/shared';
import type { Database } from '../db/database.ts';
import type { GAclRule, GCalendarService } from '../google.ts';
import { FIRM_CALENDAR } from './events.ts';

export type CalendarRole = 'writer' | 'reader';

export const roleFor = (calendario: string): CalendarRole =>
  calendario === FIRM_CALENDAR ? 'writer' : 'reader';

const email = (value: unknown): string => (typeof value === 'string' ? value : '').toLowerCase();

/** The emails that may see a portal calendar, lowercased. */
export function eligibleEmails(db: Database, calendario: string): Set<string> {
  const active = db.rows('Usuarios').filter((u) => !u.deleted && u.estado === 'ACTIVO');
  if (calendario === FIRM_CALENDAR) {
    return new Set(active.filter((u) => u.lado === 'EMPIRICA').map((u) => email(u.email)));
  }
  const ids = new Set(
    db
      .rows('Membresias')
      .filter(
        (m) =>
          !m.deleted &&
          m.estado === 'ACTIVA' &&
          m.clienteId === calendario &&
          parseAlcance(m.alcance) === null,
      )
      .map((m) => text(m, 'usuarioId')),
  );
  return new Set(
    active.filter((u) => u.lado === 'CLIENTE' && ids.has(u.id)).map((u) => email(u.email)),
  );
}

function rulesOf(cal: GCalendarService, googleId: string): GAclRule[] {
  const out: GAclRule[] = [];
  let pageToken: string | undefined;
  for (let guard = 0; guard < 50; guard++) {
    const page = cal.Acl.list(googleId, pageToken ? { pageToken } : {});
    out.push(...(page.items ?? []));
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return out;
}

/** Gives one person access; nobody is notified by Google (the portal shows the link). */
export function grantAccess(
  cal: GCalendarService,
  googleId: string,
  calendario: string,
  to: string,
): void {
  cal.Acl.insert(
    { role: roleFor(calendario), scope: { type: 'user', value: to.toLowerCase() } },
    googleId,
    {
      sendNotifications: false,
    },
  );
}

/** Takes one person's access away (nothing to do if they had none). */
export function revokeAccess(cal: GCalendarService, googleId: string, from: string): boolean {
  const target = from.toLowerCase();
  let removed = false;
  for (const rule of rulesOf(cal, googleId)) {
    if (rule.role === 'owner' || !rule.id) continue;
    if (rule.scope?.type === 'user' && email(rule.scope.value) === target) {
      cal.Acl.remove(googleId, rule.id);
      removed = true;
    }
  }
  return removed;
}

/**
 * Keeps each calendar's access to the people who qualify, with the role
 * their side has. Anything else (a share made by hand, a public link, a
 * role that does not match) is taken away. Returns how many rules went.
 */
export function reconcileAccess(
  cal: GCalendarService,
  db: Database,
  calendars: readonly { calendario: string; googleId: string }[],
): number {
  let removed = 0;
  for (const c of calendars) {
    const allowed = eligibleEmails(db, c.calendario);
    const role = roleFor(c.calendario);
    for (const rule of rulesOf(cal, c.googleId)) {
      if (rule.role === 'owner' || rule.role === 'none' || !rule.id) continue;
      const fits =
        rule.scope?.type === 'user' && allowed.has(email(rule.scope.value)) && rule.role === role;
      if (fits) continue;
      cal.Acl.remove(c.googleId, rule.id);
      removed++;
    }
  }
  return removed;
}

/** The link that opens Google Calendar ready to add the calendar. */
export const addCalendarUrl = (googleId: string): string =>
  `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(googleId)}`;
