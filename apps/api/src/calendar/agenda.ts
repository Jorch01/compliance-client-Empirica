/**
 * The agenda as the server reads it for someone: the rows of the dated
 * tabs, filtered by what that reader may see with the same rule the sync
 * uses (canRead), then turned into items. Readers: one user (the personal
 * feed, the daily summary), the firm as a whole (its calendar) and a client
 * as a whole (its calendar: what any user of the whole client sees).
 */
import {
  agendaItems,
  canRead,
  nonWorkingDays,
  text,
  type AgendaData,
  type AgendaItem,
  type Row,
  type UserContext,
} from '@empirica/shared';
import type { AgendaSettings } from '../config.ts';
import type { Database } from '../db/database.ts';

export type AgendaRows = Required<AgendaData>;

const TABS = [
  'Tareas',
  'Obligaciones',
  'CumplimientosHistorial',
  'Tramites',
  'Contratos',
  'Eventos',
] as const;

const live = (rows: readonly Row[]): Row[] => rows.filter((r) => !r.deleted);

/** The dated tabs, deleted rows left out. */
export function agendaRows(db: Database): AgendaRows {
  const out = {} as AgendaRows;
  for (const tab of TABS) out[tab] = live(db.rows(tab));
  return out;
}

/** Only what `ctx` may see. */
export function visibleRows(ctx: UserContext, db: Database, rows: AgendaRows): AgendaRows {
  const lookup = db.lookup();
  const out = {} as AgendaRows;
  for (const tab of TABS) out[tab] = rows[tab].filter((r) => canRead(ctx, tab, r, lookup));
  return out;
}

/** The firm as a whole: every client that exists, internal records included. */
export function firmReader(db: Database): UserContext {
  const clients = new Map(
    live(db.rows('Clientes')).map((c) => [
      c.id,
      { clienteId: c.id, rol: 'SOCIO_ADMIN' as const, alcance: null, units: null },
    ]),
  );
  return {
    userId: 'calendario',
    email: '',
    lado: 'EMPIRICA',
    rolBase: 'SOCIO_ADMIN',
    isAdmin: true,
    clients,
  };
}

/** A client as a whole: what a reader of the whole client (no units) sees. */
export function wholeClientReader(clienteId: string): UserContext {
  return {
    userId: 'calendario',
    email: '',
    lado: 'CLIENTE',
    rolBase: 'CLIENTE_LECTURA',
    isAdmin: false,
    clients: new Map([
      [clienteId, { clienteId, rol: 'CLIENTE_LECTURA' as const, alcance: null, units: null }],
    ]),
  };
}

/** The items of rows already filtered, by the firm's settings. */
export function itemsOf(
  visible: AgendaRows,
  db: Database,
  today: string,
  settings: AgendaSettings,
  window: { from?: string; to?: string } = {},
): AgendaItem[] {
  return agendaItems(visible, {
    today,
    ...window,
    inhabiles: nonWorkingDays(db.rows('DiasInhabiles')),
    general: settings.general,
    fatal: settings.fatal,
  });
}

/** The items a reader sees from `today`, by the firm's settings. */
export function agendaFor(
  ctx: UserContext,
  db: Database,
  rows: AgendaRows,
  today: string,
  settings: AgendaSettings,
  window: { from?: string; to?: string } = {},
): AgendaItem[] {
  return itemsOf(visibleRows(ctx, db, rows), db, today, settings, window);
}

/** Names to put in front of a title: the client's (and its unit's). */
export function namesOf(db: Database): {
  client: (id: string | null) => string | null;
  unit: (id: string | null) => string | null;
} {
  const clients = new Map(
    db
      .rows('Clientes')
      .map((c) => [c.id, text(c, 'nombreComercial') ?? text(c, 'razonSocial')] as const),
  );
  const units = new Map(db.rows('Entidades').map((e) => [e.id, text(e, 'nombre')] as const));
  return {
    client: (id) => (id ? (clients.get(id) ?? null) : null),
    unit: (id) => (id ? (units.get(id) ?? null) : null),
  };
}
