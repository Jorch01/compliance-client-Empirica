/**
 * One sheet tab as a repository: read once per request with getValues(),
 * indexed by id in memory, written back in batches with setValues().
 *
 * Columns are found by their header name, so a column added by hand at the
 * end, or the order of the columns, does not break anything; a column the
 * code needs and the sheet lacks is an error that says to run setup().
 */
import { allColumns, type ColumnDef, type Row, type TableDef } from '@empirica/shared';
import { ApiError } from '../errors.ts';
import type { GSheet } from '../google.ts';
import { decodeCell, encodeCell } from './codec.ts';

export class SheetTable {
  readonly def: TableDef;
  readonly #sheet: GSheet;
  readonly #columns: ColumnDef[];
  readonly #index = new Map<string, number>();
  readonly #width: number;
  /** Raw cells of the data rows, as read (row i is sheet row i + 2). */
  readonly #raw: unknown[][];
  readonly #rows: (Row | null)[];
  readonly #byId = new Map<string, number>();
  readonly #dirty = new Set<number>();
  #appendFrom: number;

  constructor(sheet: GSheet, def: TableDef) {
    this.def = def;
    this.#sheet = sheet;
    this.#columns = allColumns(def);
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 1 || lastColumn < 1) {
      throw new ApiError(
        'INTERNAL',
        `La pestaña ${def.name} no tiene encabezados: ejecuta setup().`,
      );
    }
    const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
    const header = (values[0] ?? []).map((h) => String(h).trim());
    header.forEach((name, i) => {
      if (name && !this.#index.has(name)) this.#index.set(name, i);
    });
    const missing = this.#columns.filter((c) => !this.#index.has(c.name)).map((c) => c.name);
    if (missing.length) {
      throw new ApiError(
        'INTERNAL',
        `Faltan columnas en la pestaña ${def.name} (${missing.join(', ')}): ejecuta setup().`,
      );
    }
    this.#width = header.length;
    this.#raw = values.slice(1);
    this.#rows = this.#raw.map((cells) => this.#decode(cells));
    this.#rows.forEach((row, i) => {
      if (row && !this.#byId.has(row.id)) this.#byId.set(row.id, i);
    });
    this.#appendFrom = this.#raw.length;
  }

  #decode(cells: unknown[]): Row | null {
    const out: Record<string, unknown> = {};
    for (const column of this.#columns) {
      out[column.name] = decodeCell(column, cells[this.#index.get(column.name) ?? -1]);
    }
    const id = out.id;
    return typeof id === 'string' && id !== '' ? (out as Row) : null;
  }

  /** Live rows (deleted ones included: they are tombstones). */
  all(): Row[] {
    return this.#rows.filter((r): r is Row => r !== null);
  }

  get(id: string): Row | undefined {
    const i = this.#byId.get(id);
    return i === undefined ? undefined : (this.#rows[i] ?? undefined);
  }

  /** Inserts or replaces a row (by id). Nothing is written until flush(). */
  put(row: Row): void {
    const existing = this.#byId.get(row.id);
    const i = existing ?? this.#raw.length;
    const cells =
      existing === undefined ? new Array<unknown>(this.#width).fill('') : [...(this.#raw[i] ?? [])];
    for (const column of this.#columns) {
      const at = this.#index.get(column.name);
      if (at !== undefined) cells[at] = encodeCell(column, row[column.name]);
    }
    this.#raw[i] = cells;
    this.#rows[i] = { ...row };
    if (existing === undefined) this.#byId.set(row.id, i);
    else this.#dirty.add(i);
  }

  /**
   * Rewrites the whole tab with these rows (to purge old ones), blanking the
   * rows left over at the end. Columns the code does not know keep their
   * values for the rows that stay.
   */
  replaceAll(rows: readonly Row[]): void {
    const previous = new Map<string, unknown[]>();
    this.#rows.forEach((r, i) => {
      if (r) previous.set(r.id, this.#raw[i] ?? []);
    });
    const blank = (): unknown[] => new Array<unknown>(this.#width).fill('');
    const fresh = rows.map((row) => {
      const cells = [...(previous.get(row.id) ?? blank())];
      for (const column of this.#columns) {
        const at = this.#index.get(column.name);
        if (at !== undefined) cells[at] = encodeCell(column, row[column.name]);
      }
      return cells;
    });
    const total = Math.max(this.#raw.length, fresh.length);
    if (total) {
      const block = [...fresh, ...Array.from({ length: total - fresh.length }, blank)];
      this.#sheet.getRange(2, 1, total, this.#width).setValues(block);
    }
    this.#raw.length = 0;
    this.#raw.push(...fresh);
    this.#rows.length = 0;
    this.#rows.push(...rows.map((r) => ({ ...r })));
    this.#byId.clear();
    this.#rows.forEach((r, i) => {
      if (r) this.#byId.set(r.id, i);
    });
    this.#dirty.clear();
    this.#appendFrom = this.#raw.length;
  }

  get pendingWrites(): number {
    return this.#dirty.size + (this.#raw.length - this.#appendFrom);
  }

  /** Writes the changed rows in contiguous blocks, then the new ones. */
  flush(): void {
    const changed = [...this.#dirty].filter((i) => i < this.#appendFrom).sort((a, b) => a - b);
    let start = 0;
    while (start < changed.length) {
      let end = start;
      while (end + 1 < changed.length && changed[end + 1] === (changed[end] ?? 0) + 1) end++;
      const first = changed[start] ?? 0;
      const block = this.#raw.slice(first, (changed[end] ?? 0) + 1);
      this.#sheet.getRange(first + 2, 1, block.length, this.#width).setValues(block);
      start = end + 1;
    }
    this.#dirty.clear();

    const fresh = this.#raw.slice(this.#appendFrom);
    if (fresh.length) {
      const firstRow = this.#appendFrom + 2;
      const lastRow = firstRow + fresh.length - 1;
      const maxRows = this.#sheet.getMaxRows();
      if (lastRow > maxRows) this.#sheet.insertRowsAfter(maxRows, lastRow - maxRows);
      this.#sheet.getRange(firstRow, 1, fresh.length, this.#width).setValues(fresh);
      this.#appendFrom = this.#raw.length;
    }
  }
}

/**
 * A tab that is only ever appended to (the audit log): rows go at the end
 * without reading the tab, only its header. Reading a growing log on every
 * write would make each one slower than the last (PLAN.md § 21).
 */
export class AppendLog {
  readonly def: TableDef;
  readonly #sheet: GSheet;
  readonly #columns: ColumnDef[];
  readonly #index = new Map<string, number>();
  readonly #width: number;
  readonly #pending: unknown[][] = [];

  constructor(sheet: GSheet, def: TableDef) {
    this.def = def;
    this.#sheet = sheet;
    this.#columns = allColumns(def);
    const lastColumn = sheet.getLastColumn();
    if (lastColumn < 1) {
      throw new ApiError(
        'INTERNAL',
        `La pestaña ${def.name} no tiene encabezados: ejecuta setup().`,
      );
    }
    const header = (sheet.getRange(1, 1, 1, lastColumn).getValues()[0] ?? []).map((h) =>
      String(h).trim(),
    );
    header.forEach((name, i) => {
      if (name && !this.#index.has(name)) this.#index.set(name, i);
    });
    const missing = this.#columns.filter((c) => !this.#index.has(c.name)).map((c) => c.name);
    if (missing.length) {
      throw new ApiError(
        'INTERNAL',
        `Faltan columnas en la pestaña ${def.name} (${missing.join(', ')}): ejecuta setup().`,
      );
    }
    this.#width = header.length;
  }

  /** Queues a row; nothing is written until flush(). */
  append(row: Row): void {
    const cells = new Array<unknown>(this.#width).fill('');
    for (const column of this.#columns) {
      const at = this.#index.get(column.name);
      if (at !== undefined) cells[at] = encodeCell(column, row[column.name]);
    }
    this.#pending.push(cells);
  }

  get pendingWrites(): number {
    return this.#pending.length;
  }

  /** Writes the queued rows after the last one (the caller holds the script lock). */
  flush(): void {
    if (!this.#pending.length) return;
    const firstRow = this.#sheet.getLastRow() + 1;
    const lastRow = firstRow + this.#pending.length - 1;
    const maxRows = this.#sheet.getMaxRows();
    if (lastRow > maxRows) this.#sheet.insertRowsAfter(maxRows, lastRow - maxRows);
    this.#sheet.getRange(firstRow, 1, this.#pending.length, this.#width).setValues(this.#pending);
    this.#pending.length = 0;
  }
}
