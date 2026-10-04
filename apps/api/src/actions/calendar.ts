/**
 * The calendars, online (PLAN.md § 7):
 * - calendar.subscribe: a new secret for the personal feed (the old one stops
 *   working), or none at all (`revoke`);
 * - calendar.share: sees a portal calendar in one's own Google Calendar, the
 *   firm's (firm users) or a client's (users of the whole client), or stops
 *   seeing it (`remove`). A client's calendar is created the first time.
 */
import {
  PROJECT_TIME_ZONE,
  isFirmRole,
  text,
  type CalendarShareData,
  type CalendarSubscribeData,
} from '@empirica/shared';
import type { Session } from '../auth.ts';
import { addCalendarUrl, grantAccess, revokeAccess } from '../calendar/acl.ts';
import { icsCacheKey } from '../calendar/feed.ts';
import { calendarService, firmCalendarId } from '../calendar/sync.ts';
import { FIRM_CALENDAR } from '../calendar/events.ts';
import { Database } from '../db/database.ts';
import type { Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import { changed, freshContext, saveChange, underLock } from './locked.ts';

export function subscribeCalendar(
  env: Env,
  session: Session,
  input: { revoke?: boolean | undefined },
): CalendarSubscribeData {
  const token = input.revoke ? null : (env.uuid() + env.uuid()).replace(/-/g, '').toLowerCase();
  underLock(env, session.user.id, (r) => {
    freshContext(r.db, session.user.id);
    const user = r.db.table('Usuarios').get(session.user.id);
    if (!user) throw new ApiError('NOT_FOUND');
    const previous = text(user, 'icsToken');
    // The old feed empties at once, even where it was kept for a while.
    if (previous) env.cachePut(icsCacheKey(previous), '', 1);
    const after = changed(r, user, { icsToken: token ? env.sha256Hex(token) : null });
    r.writer.save('Usuarios', user, after);
    r.writer.audit(
      'EDITAR',
      'Usuarios',
      user.id,
      null,
      { enlaceCalendario: previous ? 'anterior' : null },
      { enlaceCalendario: token ? 'nuevo' : null },
    );
  });
  return { token };
}

export function shareCalendar(
  env: Env,
  session: Session,
  input: { clienteId?: string | undefined; remove?: boolean | undefined },
): CalendarShareData {
  const cal = calendarService(env);
  if (!cal) {
    throw new ApiError(
      'NOT_IMPLEMENTED',
      'Los calendarios de Google todavía no están activados en el portal.',
    );
  }
  const email = (text(session.user, 'email') ?? '').toLowerCase();
  const done = (googleId: string): CalendarShareData =>
    input.remove
      ? { calendarId: null, addUrl: null }
      : { calendarId: googleId, addUrl: addCalendarUrl(googleId) };

  if (!input.clienteId) {
    if (session.ctx.lado !== 'EMPIRICA') {
      throw new ApiError('FORBIDDEN', 'El calendario del despacho es solo para el despacho.');
    }
    const googleId = firmCalendarId(env, cal);
    if (input.remove) revokeAccess(cal, googleId, email);
    else grantAccess(cal, googleId, FIRM_CALENDAR, email);
    return done(googleId);
  }

  const clienteId = input.clienteId;
  const access = session.ctx.clients.get(clienteId);
  if (!access) throw new ApiError('FORBIDDEN');
  if (isFirmRole(access.rol)) {
    throw new ApiError(
      'FORBIDDEN',
      'El despacho ve todos los clientes en el calendario del despacho.',
    );
  }
  if (access.alcance) {
    throw new ApiError(
      'FORBIDDEN',
      'Tu acceso es a una parte del cliente: usa tu enlace personal, que muestra exactamente esa parte.',
      { reason: 'PARTIAL_SCOPE' },
    );
  }
  const client = new Database(env).table('Clientes').get(clienteId);
  if (!client || client.deleted) throw new ApiError('NOT_FOUND');
  let googleId = text(client, 'calendarId');
  if (!googleId && !input.remove) {
    const name = text(client, 'nombreComercial') ?? text(client, 'razonSocial') ?? 'Cliente';
    const created = cal.Calendars.insert({
      summary: `Empírica · ${name}`,
      timeZone: PROJECT_TIME_ZONE,
      description:
        'Vencimientos y citas que el despacho comparte con ustedes. Lo escribe el portal.',
    });
    if (!created.id) throw new ApiError('INTERNAL', 'Google no devolvió el calendario creado.');
    const newId = created.id;
    googleId = underLock(env, session.user.id, (r) => {
      const current = r.db.table('Clientes').get(clienteId);
      if (!current) throw new ApiError('NOT_FOUND');
      // Someone else created it a moment ago: theirs stays.
      const existing = text(current, 'calendarId');
      if (existing) return existing;
      saveChange(r, 'Clientes', current, changed(r, current, { calendarId: newId }), clienteId, [
        'calendarId',
      ]);
      return newId;
    });
  }
  if (!googleId) return { calendarId: null, addUrl: null };
  if (input.remove) revokeAccess(cal, googleId, email);
  else grantAccess(cal, googleId, clienteId, email);
  return done(googleId);
}
