/**
 * The personal calendar feed: `GET <Web App>?action=ics&token=<secret>`,
 * what Google Calendar, Outlook or Apple Calendar subscribe to. The secret
 * names the person (only its hash is stored, `Usuarios.icsToken`); the feed
 * holds exactly what they may see now, in their language. A secret that
 * names nobody active gets an empty calendar, never an error page, so a
 * revoked subscription simply empties.
 *
 * Calendar apps ask often: a feed is kept for 15 minutes (when it fits in
 * the cache), so a revoked secret or a withdrawn access takes at most that
 * long to show.
 */
import {
  buildUserContext,
  renderIcs,
  text,
  toProjectDate,
  type AgendaLanguage,
} from '@empirica/shared';
import { readAgendaSettings } from '../config.ts';
import { Database } from '../db/database.ts';
import type { Env } from '../env.ts';
import { agendaFor, agendaRows, namesOf } from './agenda.ts';

const CACHE_SECONDS = 900;
/** CacheService keeps up to 100 KB a value. */
const CACHE_MAX_CHARS = 90_000;

export const icsCacheKey = (tokenHash: string): string => `ics:${tokenHash}`;

const isToken = (value: string): boolean => /^[0-9a-f]{64}$/.test(value);

export function icsFeed(env: Env, token: string): string {
  const now = env.now();
  const empty = (): string =>
    renderIcs({
      name: 'Empírica Portal',
      items: [],
      now,
      portalUrl: 'https://portal.empirica.mx/',
    });
  if (!isToken(token)) return empty();
  const hash = env.sha256Hex(token);
  const cached = env.cacheGet(icsCacheKey(hash));
  if (cached) return cached;

  const db = new Database(env);
  const user = db
    .rows('Usuarios')
    .find((u) => !u.deleted && u.estado === 'ACTIVO' && u.icsToken === hash);
  if (!user) return empty();
  const ctx = buildUserContext({
    user,
    membresias: db.rows('Membresias'),
    entidades: db.rows('Entidades'),
    clientes: db.rows('Clientes'),
  });
  const settings = readAgendaSettings(db.rows('Config'));
  const items = agendaFor(ctx, db, agendaRows(db), toProjectDate(now), settings);
  const names = namesOf(db);
  const clients = [...ctx.clients.keys()];
  const several = ctx.lado === 'EMPIRICA' || clients.length !== 1;
  const lang: AgendaLanguage = text(user, 'idioma') === 'en' ? 'en' : 'es';
  const ics = renderIcs({
    name: several
      ? 'Empírica Portal'
      : `Empírica · ${names.client(clients[0] ?? null) ?? 'Portal'}`,
    items,
    now,
    portalUrl: settings.portalUrl,
    lang,
    prefixOf: (i) => (several ? names.client(i.clienteId) : names.unit(i.entidadId)),
    contextOf: (i) =>
      [names.client(i.clienteId), names.unit(i.entidadId)].filter(Boolean).join(' · ') || null,
  });
  if (ics.length <= CACHE_MAX_CHARS) env.cachePut(icsCacheKey(hash), ics, CACHE_SECONDS);
  return ics;
}
