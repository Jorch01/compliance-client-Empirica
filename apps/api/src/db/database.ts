/**
 * The tabs of one request, loaded lazily, and the global sequence that
 * numbers every change (`serverSeq`).
 *
 * Sequence protocol (see PLAN.md § 5):
 * - writers hold the script lock, take numbers after max(SEQ_RESERVED,
 *   SEQ_COMMITTED), save SEQ_RESERVED before writing, write the rows, and
 *   only then save SEQ_COMMITTED;
 * - readers do not take the lock: they read SEQ_COMMITTED first and only
 *   return rows numbered up to it, which are completely written. A row being
 *   written at that moment carries a higher number and goes out next time.
 * If a write dies half way, the next writer starts after the reserved
 * numbers, and its commit makes the rows that did get written visible.
 */
import {
  TABLES,
  TABLE_NAMES,
  userHasClientAccess,
  type Row,
  type TableName,
  type WriteLookup,
} from '@empirica/shared';
import { PROP, type Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import type { GSpreadsheet } from '../google.ts';
import { SheetTable } from './table.ts';

export function openSpreadsheet(env: Env): GSpreadsheet {
  const id = env.prop(PROP.spreadsheetId);
  if (!id) throw new ApiError('INTERNAL', 'El portal no está configurado: ejecuta setup().');
  return env.g.SpreadsheetApp.openById(id);
}

export class Database {
  readonly env: Env;
  readonly #ss: GSpreadsheet;
  readonly #tables = new Map<TableName, SheetTable>();

  constructor(env: Env, ss: GSpreadsheet = openSpreadsheet(env)) {
    this.env = env;
    this.#ss = ss;
  }

  get spreadsheet(): GSpreadsheet {
    return this.#ss;
  }

  table(name: TableName): SheetTable {
    let t = this.#tables.get(name);
    if (!t) {
      const sheet = this.#ss.getSheetByName(name);
      if (!sheet) throw new ApiError('INTERNAL', `Falta la pestaña ${name}: ejecuta setup().`);
      t = new SheetTable(sheet, TABLES[name]);
      this.#tables.set(name, t);
    }
    return t;
  }

  rows(name: TableName): Row[] {
    return this.table(name).all();
  }

  /** Lookup used by the permission rules; sees changes made in this request. */
  lookup(): WriteLookup {
    return {
      get: (table, id) => this.table(table).get(id),
      userCanAccess: (userId, clienteId) =>
        userHasClientAccess(this.rows('Usuarios'), this.rows('Membresias'), userId, clienteId),
    };
  }

  /** Writes every pending change, tab by tab, in the registry order. */
  flush(): void {
    for (const name of TABLE_NAMES) {
      const t = this.#tables.get(name);
      if (t?.pendingWrites) t.flush();
    }
  }

  get pendingWrites(): number {
    let n = 0;
    for (const t of this.#tables.values()) n += t.pendingWrites;
    return n;
  }
}

export class Sequence {
  readonly #env: Env;
  #current: number;
  #reserved: number;

  constructor(env: Env) {
    this.#env = env;
    const reserved = Number(env.prop(PROP.seqReserved) ?? 0) || 0;
    const committed = Number(env.prop(PROP.seqCommitted) ?? 0) || 0;
    this.#current = Math.max(reserved, committed);
    this.#reserved = this.#current;
  }

  /** The last fully written number, for readers. */
  static committed(env: Env): number {
    return Number(env.prop(PROP.seqCommitted) ?? 0) || 0;
  }

  next(): number {
    this.#current += 1;
    return this.#current;
  }

  get used(): boolean {
    return this.#current > this.#reserved;
  }

  /** Before writing: no later writer may reuse these numbers. */
  reserve(): void {
    if (!this.used) return;
    this.#env.setProp(PROP.seqReserved, String(this.#current));
  }

  /** After writing: the rows are complete and readers may return them. */
  commit(): void {
    if (!this.used) return;
    this.#env.setProp(PROP.seqCommitted, String(this.#current));
    this.#reserved = this.#current;
  }
}
