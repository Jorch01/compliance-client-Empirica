/**
 * "Crear con IA" on the device (F8, PLAN.md § 24, D73–D77): who may use
 * it, the fields the preview edits, and creating the reviewed proposal as
 * if typed in the forms: matters first, links turned into the new ids, a
 * filing in its template's first stage, each record marked as the AI's
 * for the Bitacora. The server only proposes; this is what writes.
 */
import {
  RECORD_PATH,
  moveToStage,
  resolveDraft,
  type DraftItem,
  type DraftRecord,
  type DraftTable,
  type Value,
} from '@empirica/shared';
import { roleIn } from '../../domain/access.ts';
import type { Me } from '../../session/context.ts';
import type { SyncEngine } from '../../sync/engine.ts';
import type { Template } from '../filings/filings.ts';
import { aiOn } from './ai.ts';

/** Whether this person creates with the AI for a client: its SOCIO_ADMIN or ABOGADO, with the AI on (D73). */
export function mayDraft(me: Me, clientId: string | null): boolean {
  if (!clientId) return false;
  const rol = roleIn(me, clientId);
  return (rol === 'SOCIO_ADMIN' || rol === 'ABOGADO') && aiOn(me, clientId);
}

/** Whether this person creates with the AI for any of their clients. */
export const draftsForAny = (me: Me): boolean => me.clients.some((c) => mayDraft(me, c.id));

/** Where each created record opens. */
export const DRAFT_PATH: Record<DraftTable, string> = { Asuntos: '/asuntos', ...RECORD_PATH };

const str = (value: Value | undefined): string => (typeof value === 'string' ? value.trim() : '');

/** The name an item goes by: a title, an obligation's name or a contract's counterparty. */
export function itemTitle(item: Pick<DraftItem, 'fields'>): string {
  return str(item.fields.titulo) || str(item.fields.nombre) || str(item.fields.contraparte);
}

/** "-05:00": the firm's offset, as the appointment form writes it. */
const OFFSET = '-05:00';

/** An appointment's day and times, as the preview shows them. */
export interface EventParts {
  day: string;
  start: string;
  end: string;
  allDay: boolean;
}

const partOf = (value: Value | undefined): { day: string; time: string } => {
  const s = typeof value === 'string' ? value : '';
  return { day: s.slice(0, 10), time: s.slice(11, 16) };
};

export function eventParts(fields: Readonly<Record<string, Value>>): EventParts {
  const start = partOf(fields.inicio);
  const end = partOf(fields.fin);
  return {
    day: start.day,
    start: start.time || '10:00',
    end: end.time || '11:00',
    allDay: fields.todoElDia === true,
  };
}

/** The columns of an appointment from its day and times (no day, no start). */
export function eventFields(parts: EventParts): Record<string, Value> {
  if (!parts.day) return { inicio: null, fin: null, todoElDia: parts.allDay };
  const at = (time: string): string => `${parts.day}T${time}:00.000${OFFSET}`;
  return {
    inicio: at(parts.allDay ? '00:00' : parts.start),
    fin: parts.allDay ? null : at(parts.end),
    todoElDia: parts.allDay,
  };
}

/**
 * Creates the reviewed proposal on the device, in order, each record as
 * its form would (a filing from a template starts in its first stage); the
 * server checks each one as any other change. Returns what was created.
 */
export async function createDraft(
  engine: Pick<SyncEngine, 'mutate'>,
  items: readonly DraftItem[],
  options: {
    templates: ReadonlyMap<string, Template>;
    today: string;
    newId?: () => string;
  },
): Promise<DraftRecord[]> {
  const records = resolveDraft(items, options.newId ?? (() => crypto.randomUUID()));
  for (const record of records) {
    const fields = { ...record.fields };
    if (record.table === 'Tramites' && typeof fields.plantillaId === 'string') {
      const first = options.templates.get(fields.plantillaId)?.stages[0];
      if (first) Object.assign(fields, moveToStage({ id: record.id }, first.nombre, options.today));
    }
    await engine.mutate(record.table, 'create', record.id, fields, { via: 'IA' });
  }
  return records;
}
