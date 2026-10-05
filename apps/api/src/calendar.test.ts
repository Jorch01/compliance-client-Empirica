/**
 * The Google calendars and the personal feed (F5), against the fake
 * Calendar: what each calendar holds, what comes back from Google, who may
 * see each one, and what each person's feed shows.
 */
import type { CalendarShareData, CalendarSubscribeData } from '@empirica/shared';
import { ID } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { icsFeed } from './calendar/feed.ts';
import { syncCalendars } from './calendar/sync.ts';
import { PROP } from './env.ts';
import type { GCalendarEvent } from './google.ts';
import { createWorld, type World } from './testing/harness.ts';

const firmId = (w: World): string => w.google.props.get(PROP.firmCalendarId) ?? '';
const clave = (e: GCalendarEvent): string => e.extendedProperties?.private?.clave ?? '';
const keys = (w: World, calendarId: string): string[] =>
  w.google.calendar.live(calendarId).map(clave).sort();
const eventOf = (w: World, calendarId: string, key: string): GCalendarEvent => {
  const ev = w.google.calendar.live(calendarId).find((e) => clave(e) === key);
  if (!ev) throw new Error(`No event for ${key}`);
  return ev;
};
const share = (w: World, as: string, clienteId?: string): CalendarShareData =>
  w.ok<CalendarShareData>('calendar.share', clienteId ? { clienteId } : {}, { as });
const subscribe = (w: World, as: string): string => {
  const { token } = w.ok<CalendarSubscribeData>('calendar.subscribe', {}, { as });
  if (!token) throw new Error('No token');
  return token;
};
const events = (ics: string): number => ics.split('BEGIN:VEVENT').length - 1;

describe('the firm calendar', () => {
  it('holds every client’s dates, internal ones too, each led by its client', () => {
    const w = createWorld();
    const report = syncCalendars(w.env);
    expect(report).toMatchObject({ skipped: null, failed: 0, partial: false });
    const firm = firmId(w);
    const all = keys(w, firm);
    expect(all).toContain(`Tareas:${ID.tNorte1}`);
    expect(all).toContain(`Eventos:${ID.evNorte}`);
    // The internal obligation is there: the firm sees everything.
    expect(all.some((k) => k.startsWith(`Obligaciones:${ID.obInterna}:`))).toBe(true);
    // Client B's too.
    expect(all.some((k) => k.startsWith(`Obligaciones:${ID.obB}:`))).toBe(true);
    expect(eventOf(w, firm, `Tareas:${ID.tNorte1}`)).toMatchObject({
      summary: 'Cliente Demo · Vence: Entregar acta constitutiva',
      start: { date: '2026-10-15' },
      end: { date: '2026-10-16' },
      transparency: 'transparent',
    });
    // The appointment keeps its own name and its time.
    expect(eventOf(w, firm, `Eventos:${ID.evNorte}`)).toMatchObject({
      summary: 'Cliente Demo · Visita de verificación',
      start: { dateTime: '2026-10-20T15:00:00.000Z' },
    });
    expect(report.inserted).toBe(all.length);
  });

  it('writes nothing when nothing changed', () => {
    const w = createWorld();
    syncCalendars(w.env);
    expect(syncCalendars(w.env)).toMatchObject({ inserted: 0, patched: 0, deleted: 0, failed: 0 });
  });

  it('follows the portal: a deadline moved is patched, a task done leaves', () => {
    const w = createWorld();
    syncCalendars(w.env);
    const firm = firmId(w);
    w.edit('Tareas', ID.tNorte1, { fechaLimite: '2026-10-22' });
    expect(syncCalendars(w.env)).toMatchObject({ patched: 1, inserted: 0, deleted: 0 });
    expect(eventOf(w, firm, `Tareas:${ID.tNorte1}`).start).toEqual({ date: '2026-10-22' });
    w.edit('Tareas', ID.tNorte1, { estado: 'HECHO' });
    expect(syncCalendars(w.env)).toMatchObject({ deleted: 1 });
    expect(keys(w, firm)).not.toContain(`Tareas:${ID.tNorte1}`);
  });

  it('brings back an appointment moved in Google, and puts back a deadline, telling its lawyer', () => {
    const w = createWorld();
    syncCalendars(w.env);
    const firm = firmId(w);
    const appointment = eventOf(w, firm, `Eventos:${ID.evNorte}`);
    w.google.calendar.userMove(
      firm,
      appointment.id ?? '',
      { dateTime: '2026-10-21T16:00:00-05:00' },
      { dateTime: '2026-10-21T17:30:00-05:00' },
    );
    const deadline = eventOf(w, firm, `Tareas:${ID.tNorte1}`);
    w.google.calendar.userMove(
      firm,
      deadline.id ?? '',
      { date: '2026-10-25' },
      { date: '2026-10-26' },
    );

    expect(syncCalendars(w.env)).toMatchObject({ moved: 1, reverted: 1, failed: 0 });
    expect(w.row('Eventos', ID.evNorte)).toMatchObject({
      inicio: '2026-10-21T16:00:00.000-05:00',
      fin: '2026-10-21T17:30:00.000-05:00',
      todoElDia: false,
    });
    expect(
      w.rows('Bitacora').some((b) => b.entidad === 'Eventos' && b.usuarioId === 'calendario'),
    ).toBe(true);
    // The deadline is the portal's again.
    expect(eventOf(w, firm, `Tareas:${ID.tNorte1}`).start).toEqual({ date: '2026-10-15' });
    expect(
      w
        .rows('Notificaciones')
        .filter((n) => n.tipo === 'CALENDARIO_REVERTIDO')
        .map((n) => [n.usuarioId, n.link, n.mensaje]),
    ).toEqual([[ID.abogado, `/tareas/${ID.tNorte1}`, 'Vence: Entregar acta constitutiva']]);
    // Nothing left to do afterwards.
    expect(syncCalendars(w.env)).toMatchObject({ moved: 0, reverted: 0, patched: 0 });
  });

  it('puts back a deadline deleted or renamed in Google', () => {
    const w = createWorld();
    syncCalendars(w.env);
    const firm = firmId(w);
    const deadline = eventOf(w, firm, `Tareas:${ID.tNorte1}`);
    w.google.calendar.Events.remove(firm, deadline.id ?? '');
    const contract = w.google.calendar
      .live(firm)
      .find((e) => clave(e).startsWith(`Contratos:${ID.ctNorte}:`));
    w.google.calendar.userEdit(firm, contract?.id ?? '', { summary: 'Otro nombre' });
    syncCalendars(w.env);
    expect(eventOf(w, firm, `Tareas:${ID.tNorte1}`).id).toBe(deadline.id);
    expect(w.google.calendar.live(firm).find((e) => e.id === contract?.id)?.summary).toMatch(
      /^Cliente Demo · /,
    );
  });

  it('leaves alone the events people add to it', () => {
    const w = createWorld();
    syncCalendars(w.env);
    const firm = firmId(w);
    const own = w.google.calendar.Events.insert({ summary: 'Comida del equipo' }, firm);
    syncCalendars(w.env);
    expect(w.google.calendar.live(firm).some((e) => e.id === own.id)).toBe(true);
  });

  it('reads everything again when Google forgets where it left off, without copies', () => {
    const w = createWorld();
    syncCalendars(w.env);
    const firm = firmId(w);
    const before = keys(w, firm);
    w.google.calendar.oldestToken = Number.MAX_SAFE_INTEGER;
    expect(syncCalendars(w.env)).toMatchObject({ inserted: 0, failed: 0 });
    expect(keys(w, firm)).toEqual(before);
  });

  it('stops at its time budget, and the next run carries on', () => {
    const w = createWorld();
    expect(syncCalendars(w.env, -1)).toMatchObject({ partial: true, inserted: 0 });
    expect(syncCalendars(w.env).inserted).toBeGreaterThan(0);
  });

  it('waits while Calendar is not authorized', () => {
    const w = createWorld();
    w.google.calendarAuthorized = false;
    expect(syncCalendars(w.env).skipped).toBe('CALENDAR_NOT_AUTHORIZED');
  });
});

describe('a client calendar', () => {
  it('is created when a user of the whole client asks, and holds only what the client sees', () => {
    const w = createWorld();
    const data = share(w, ID.cAdmin, ID.clienteA);
    const calendarId = data.calendarId ?? '';
    expect(data.addUrl).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarId)}`,
    );
    expect(w.row('Clientes', ID.clienteA)?.calendarId).toBe(calendarId);
    expect(
      w.google.calendar.calendars.get(calendarId)?.acl.get('user:admin@cliente-a.example'),
    ).toMatchObject({ role: 'reader' });
    syncCalendars(w.env);
    const held = keys(w, calendarId);
    expect(held).toContain(`Tareas:${ID.tNorte1}`);
    expect(held.some((k) => k.includes(ID.obInterna))).toBe(false);
    expect(held.some((k) => k.includes(ID.obB))).toBe(false);
    // One calendar, one client: titles lead with the unit instead.
    expect(eventOf(w, calendarId, `Tareas:${ID.tNorte1}`).summary).not.toContain('Cliente Demo');
    // A second user of the whole client gets the same calendar.
    expect(share(w, ID.cLectura, ID.clienteA).calendarId).toBe(calendarId);
  });

  it('is refused to a user of some units, who has the personal feed instead', () => {
    const w = createWorld();
    const res = w.call('calendar.share', { clienteId: ID.clienteA }, { as: ID.cAdminSur });
    expect(res.ok ? null : [res.error.code, res.error.details?.reason]).toEqual([
      'FORBIDDEN',
      'PARTIAL_SCOPE',
    ]);
    const firm = w.call('calendar.share', {}, { as: ID.cAdmin });
    expect(firm.ok ? null : firm.error.code).toBe('FORBIDDEN');
  });

  it('loses whoever loses access, and whatever was shared by hand', () => {
    const w = createWorld();
    const calendarId = share(w, ID.cAdmin, ID.clienteA).calendarId ?? '';
    share(w, ID.cLectura, ID.clienteA);
    w.google.calendar.Acl.insert(
      { role: 'writer', scope: { type: 'user', value: 'ajeno@example.com' } },
      calendarId,
    );
    w.ok('admin.users.update', { usuarioId: ID.cLectura, estado: 'INACTIVO' }, { as: ID.socio });
    expect(syncCalendars(w.env).revoked).toBe(2);
    expect([...(w.google.calendar.calendars.get(calendarId)?.acl.keys() ?? [])].sort()).toEqual([
      'user:admin@cliente-a.example',
      'user:portal-owner@example.com',
    ]);
  });
});

describe('the firm calendar in one’s own Google Calendar', () => {
  const acl = (w: World): Map<string, unknown> =>
    w.google.calendar.calendars.get(firmId(w))?.acl ?? new Map<string, unknown>();

  it('is shared with a partner as writer, and taken away on request', () => {
    const w = createWorld();
    const data = share(w, ID.socio);
    expect(data.calendarId).toBe(firmId(w));
    expect(acl(w).get('user:socia@despacho.example')).toMatchObject({ role: 'writer' });
    expect(w.ok<CalendarShareData>('calendar.share', { remove: true }, { as: ID.socio })).toEqual({
      calendarId: null,
      addUrl: null,
    });
    expect(acl(w).has('user:socia@despacho.example')).toBe(false);
  });

  it('is not for a lawyer, who sees only their clients: the personal feed shows them', () => {
    const w = createWorld();
    for (const as of [ID.abogado, ID.asistente]) {
      const res = w.call('calendar.share', {}, { as });
      expect(res.ok ? null : [res.error.code, res.error.details?.reason]).toEqual([
        'FORBIDDEN',
        'PARTIAL_SCOPE',
      ]);
    }
    // Shared by hand, or before a partner stopped being one: the next run takes it away.
    share(w, ID.socio);
    w.google.calendar.Acl.insert(
      { role: 'writer', scope: { type: 'user', value: 'abogado@despacho.example' } },
      firmId(w),
    );
    expect(syncCalendars(w.env).revoked).toBe(1);
    expect([...acl(w).keys()].sort()).toEqual([
      'user:portal-owner@example.com',
      'user:socia@despacho.example',
    ]);
    // The lawyer's feed: their client, internal records too; nothing of the others.
    w.edit('Tareas', ID.tB, { fechaLimite: '2026-10-21' });
    const feed = icsFeed(w.env, subscribe(w, ID.abogado));
    expect(feed).toContain('Entregar acta constitutiva');
    expect(icsFeed(w.env, subscribe(w, ID.socio))).toContain('Enviar logotipo');
    expect(feed).not.toContain('Enviar logotipo');
  });
});

describe('the personal feed', () => {
  it('shows a user of a unit exactly what they may see', () => {
    const w = createWorld();
    const ics = icsFeed(w.env, subscribe(w, ID.cAdminSur));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain(ID.obSur);
    expect(ics).not.toContain(ID.tNorte1);
    expect(ics).not.toContain(ID.obInterna);
    expect(ics).not.toContain(ID.obB);
    expect(ics).not.toContain('Interno');
  });

  it('gives the firm everything, and says what the client does not see', () => {
    const w = createWorld();
    const ics = icsFeed(w.env, subscribe(w, ID.socio));
    expect(ics).toContain(ID.obInterna);
    expect(ics).toContain(ID.obB);
    expect(ics.replace(/\r\n /g, '')).toContain('Interno: el cliente no lo ve.');
  });

  it('speaks the person’s language', () => {
    const w = createWorld();
    w.ok('profile.update', { idioma: 'en' }, { as: ID.cAdmin });
    const ics = icsFeed(w.env, subscribe(w, ID.cAdmin)).replace(/\r\n /g, '');
    expect(ics).toMatch(/SUMMARY:[^\r]*Due: Entregar acta constitutiva/);
    expect(ics).not.toContain('Vence:');
  });

  it('works with one link at a time: a new one replaces the old, and revoking empties it', () => {
    const w = createWorld();
    const first = subscribe(w, ID.cAdmin);
    const second = subscribe(w, ID.cAdmin);
    expect(events(icsFeed(w.env, first))).toBe(0);
    expect(events(icsFeed(w.env, second))).toBeGreaterThan(0);
    expect(
      w.ok<CalendarSubscribeData>('calendar.subscribe', { revoke: true }, { as: ID.cAdmin }),
    ).toEqual({ token: null });
    expect(events(icsFeed(w.env, second))).toBe(0);
    // Only the hash is kept.
    expect(w.row('Usuarios', ID.cAdmin)?.icsToken).toBeNull();
  });

  it('empties for whoever lost access, once the copy it kept expires', () => {
    const w = createWorld();
    const token = subscribe(w, ID.cLectura);
    expect(events(icsFeed(w.env, token))).toBeGreaterThan(0);
    w.ok('admin.users.update', { usuarioId: ID.cLectura, estado: 'INACTIVO' }, { as: ID.socio });
    w.clock.advance(16 * 60_000);
    expect(events(icsFeed(w.env, token))).toBe(0);
  });

  it('answers a link that names nobody with an empty calendar', () => {
    const w = createWorld();
    for (const token of ['', 'abc', 'f'.repeat(64)]) {
      const ics = icsFeed(w.env, token);
      expect(ics).toContain('END:VCALENDAR');
      expect(events(ics)).toBe(0);
    }
  });
});
