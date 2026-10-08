/**
 * Crear con IA (F8, PLAN.md § 24): the records the AI proposes to a lawyer,
 * as the server hands them to the browser. Each item already speaks the
 * portal's columns (the server turned the AI's answer into them); the
 * lawyer corrects it in the preview and creates it from the device, as if
 * typed in its form. Nothing here talks to the AI.
 */
import { TABLES, type TableName } from './tables.ts';
import { missingRequired, validateFields } from './validate.ts';
import type { Value } from './values.ts';

/** The tabs a proposal creates records in, in the order they are created. */
export const DRAFT_TABLES = [
  'Asuntos',
  'Tareas',
  'Tramites',
  'Obligaciones',
  'Contratos',
  'Eventos',
] as const satisfies readonly TableName[];
export type DraftTable = (typeof DRAFT_TABLES)[number];

export const isDraftTable = (name: string): name is DraftTable =>
  (DRAFT_TABLES as readonly string[]).includes(name);

/** Most items in one proposal (D77). */
export const MAX_DRAFT_ITEMS = 15;
/** The longest request a lawyer may write. */
export const MAX_DRAFT_REQUEST = 1_500;
/** A title as long as the forms take. */
export const MAX_DRAFT_TITLE = 200;

/** What an item may hang from within its proposal: its matter, or the task it waits for. */
export type DraftLink = 'asuntoId' | 'dependeDe';

export interface DraftItem {
  /** The item's key in its proposal ("E1"); links name it. */
  key: string;
  table: DraftTable;
  /** The record's own columns, `clienteId` included, as its form would write them. */
  fields: Record<string, Value>;
  /** Items of the same proposal it hangs from, by key. */
  links: Partial<Record<DraftLink, string>>;
  /** Columns the AI filled that the lawyer must check: a date, a fatal deadline, a rule. */
  review: string[];
  /** Filled from the firm's own catalog or template rather than by the AI. */
  source?: { table: 'CatalogoObligaciones' | 'PlantillasTramite'; id: string };
}

/**
 * The proposal without one of its items. A matter takes its tasks with it,
 * as deleting a matter does (D33); anything else that named the item only
 * loses the link.
 */
export function withoutItem(items: readonly DraftItem[], key: string): DraftItem[] {
  const target = items.find((i) => i.key === key);
  if (!target) return [...items];
  const gone = new Set([key]);
  if (target.table === 'Asuntos') {
    for (const i of items) if (i.table === 'Tareas' && i.links.asuntoId === key) gone.add(i.key);
  }
  return items
    .filter((i) => !gone.has(i.key))
    .map((i) => {
      const kept = Object.entries(i.links).filter(([, k]) => !gone.has(k));
      return kept.length === Object.keys(i.links).length
        ? i
        : { ...i, links: Object.fromEntries(kept) };
    });
}

/**
 * The order records are created in: matters first (their tasks and filings
 * name them), each task after the one it waits for, then the rest in the
 * order of DRAFT_TABLES.
 */
export function draftOrder(items: readonly DraftItem[]): DraftItem[] {
  const tasks = items.filter((i) => i.table === 'Tareas');
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const orderedTasks: DraftItem[] = [];
  const visit = (task: DraftItem): void => {
    if (placed.has(task.key) || visiting.has(task.key)) return;
    visiting.add(task.key);
    const before = tasks.find((t) => t.key === task.links.dependeDe);
    if (before) visit(before);
    visiting.delete(task.key);
    placed.add(task.key);
    orderedTasks.push(task);
  };
  for (const task of tasks) visit(task);
  return DRAFT_TABLES.flatMap((table) =>
    table === 'Tareas' ? orderedTasks : items.filter((i) => i.table === table),
  );
}

/** A record ready to create: its new id and its columns, links resolved. */
export interface DraftRecord {
  key: string;
  table: DraftTable;
  id: string;
  fields: Record<string, Value>;
}

/**
 * What creating a proposal writes, in order: every item with a new id and
 * its links turned into the ids of items created before it. A link to an
 * item that is not there, or that would go in circles, is left out.
 */
export function resolveDraft(items: readonly DraftItem[], newId: () => string): DraftRecord[] {
  const ids = new Map<string, string>();
  return draftOrder(items).map((item) => {
    const id = newId();
    const fields: Record<string, Value> = { ...item.fields };
    const matter = item.links.asuntoId ? ids.get(item.links.asuntoId) : undefined;
    if (matter) {
      if (item.table === 'Eventos') fields.origen = { tipo: 'Asuntos', id: matter };
      else fields.asuntoId = matter;
    }
    const waitsFor = item.links.dependeDe ? ids.get(item.links.dependeDe) : undefined;
    if (waitsFor) fields.dependeDe = waitsFor;
    ids.set(item.key, id);
    return { key: item.key, table: item.table, id, fields };
  });
}

/**
 * The columns that keep an item from being created as it stands: a value
 * its column does not take, a mandatory one missing, an end before its start.
 */
export function draftIssues(item: DraftItem): string[] {
  const def = TABLES[item.table];
  const check = validateFields(def, item.fields);
  const out = new Set(check.ok ? [] : check.issues.map((i) => i.field));
  for (const field of missingRequired(def, item.fields)) out.add(field);
  if (item.table === 'Eventos' && item.fields.todoElDia !== true) {
    const { inicio, fin } = item.fields;
    if (typeof inicio === 'string' && typeof fin === 'string' && fin <= inicio) out.add('fin');
  }
  return [...out];
}
