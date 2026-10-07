/**
 * The audit log's yearly archive (D66): the oldest entries of the live tab,
 * one chunk at a time, are copied cell by cell to the spreadsheet of their
 * year in Respaldos and then deleted from the live tab, so the night never
 * holds a whole year in memory and the tab gives its cells back.
 *
 * Text keeps its apostrophe (nothing becomes a formula), columns are matched
 * by name, and an entry the archive already has (a night that failed between
 * the copy and the deletion) is not copied again.
 */
import { TABLES, allColumns, parseInstant, toProjectDate } from '@empirica/shared';
import type { Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import type { GFolder, GSheet, GSpreadsheet } from '../google.ts';
import { decodeCell } from './codec.ts';

const TAB = 'Bitacora';
const CREATED_AT = allColumns(TABLES.Bitacora).find((c) => c.name === 'createdAt');

interface Book {
  sheet: GSheet;
  columns: string[];
  ids: Set<string>;
}

const isBlank = (v: unknown): boolean => v === '' || v === null || v === undefined;

/** A value as read, written back the same: text stays literal text. */
const literal = (v: unknown): unknown => (typeof v === 'string' && v !== '' ? `'${v}` : v);

const headerOf = (sheet: GSheet): string[] => {
  const width = sheet.getLastColumn();
  return width < 1
    ? []
    : (sheet.getRange(1, 1, 1, width).getValues()[0] ?? []).map((h) => String(h).trim());
};

export class AuditArchive {
  readonly #env: Env;
  readonly #folder: GFolder;
  readonly #name: (year: number) => string;
  readonly #books = new Map<number, Book>();

  constructor(env: Env, folder: GFolder, name: (year: number) => string) {
    this.#env = env;
    this.#folder = folder;
    this.#name = name;
  }

  /**
   * Moves the oldest entries from before `year`, at most `chunk` rows: how
   * many left the live tab per year, and whether more may follow. It stops
   * at the first entry of `year`; one from before it that came later (two
   * requests around midnight) waits for next year's night.
   */
  moveOldest(
    live: GSheet,
    year: number,
    chunk: number,
  ): { moved: Map<number, number>; more: boolean } {
    const moved = new Map<number, number>();
    const lastRow = live.getLastRow();
    if (lastRow < 2) return { moved, more: false };
    const header = headerOf(live);
    const at = header.indexOf('createdAt');
    const idAt = header.indexOf('id');
    if (!CREATED_AT || at < 0 || idAt < 0) {
      throw new ApiError('INTERNAL', `Faltan columnas en la pestaña ${TAB}: ejecuta setup().`);
    }
    const n = Math.min(chunk, lastRow - 1);
    const byYear = new Map<number, unknown[][]>();
    let take = 0;
    for (const cells of live.getRange(2, 1, n, header.length).getValues()) {
      if (!cells.every(isBlank)) {
        const instant = parseInstant(decodeCell(CREATED_AT, cells[at]));
        // An entry whose date cannot be read goes with last year's.
        const entryYear = instant === null ? year - 1 : Number(toProjectDate(instant).slice(0, 4));
        if (entryYear >= year) break;
        let rows = byYear.get(entryYear);
        if (!rows) byYear.set(entryYear, (rows = []));
        rows.push(cells);
      }
      take++;
    }
    // The copies first: only then do the entries leave the live tab.
    for (const [entryYear, rows] of byYear) {
      this.#append(entryYear, header, idAt, rows);
      moved.set(entryYear, rows.length);
    }
    if (take) {
      // A tab keeps one row besides its header: an empty one goes in first if all would go.
      if (take >= live.getMaxRows() - 1) live.insertRowsAfter(live.getMaxRows(), 1);
      live.deleteRows(2, take);
    }
    return { moved, more: take === n };
  }

  #append(year: number, header: string[], idAt: number, rows: unknown[][]): void {
    const book = this.#book(year, header);
    // Columns of a newer model that the year's spreadsheet lacks go at its end.
    const missing = header.filter((h) => h && !book.columns.includes(h));
    if (missing.length) {
      const needed = book.columns.length + missing.length;
      const maxColumns = book.sheet.getMaxColumns();
      if (needed > maxColumns) book.sheet.insertColumnsAfter(maxColumns, needed - maxColumns);
      book.sheet.getRange(1, book.columns.length + 1, 1, missing.length).setValues([missing]);
      book.columns.push(...missing);
    }
    const fresh = rows.filter((cells) => !book.ids.has(String(cells[idAt])));
    if (!fresh.length) return;
    const from = book.columns.map((name) => header.indexOf(name));
    const out = fresh.map((cells) => from.map((i) => (i < 0 ? '' : literal(cells[i]))));
    const first = book.sheet.getLastRow() + 1;
    const last = first + out.length - 1;
    const maxRows = book.sheet.getMaxRows();
    if (last > maxRows) book.sheet.insertRowsAfter(maxRows, last - maxRows);
    book.sheet.getRange(first, 1, out.length, book.columns.length).setValues(out);
    for (const cells of fresh) book.ids.add(String(cells[idAt]));
  }

  /** The year's spreadsheet in Respaldos: the one there (with the ids it has) or a new one. */
  #book(year: number, header: string[]): Book {
    const known = this.#books.get(year);
    if (known) return known;
    const name = this.#name(year);
    let ss: GSpreadsheet | null = null;
    const files = this.#folder.getFiles();
    while (files.hasNext() && !ss) {
      const file = files.next();
      if (!file.isTrashed() && file.getName() === name) {
        ss = this.#env.g.SpreadsheetApp.openById(file.getId());
      }
    }
    const book = ss ? this.#open(ss, name) : this.#create(name, year, header);
    this.#books.set(year, book);
    return book;
  }

  #open(ss: GSpreadsheet, name: string): Book {
    const sheet = ss.getSheetByName(TAB);
    if (!sheet) throw new Error(`El archivo ${name} no tiene la pestaña ${TAB}.`);
    const columns = headerOf(sheet);
    const idAt = columns.indexOf('id');
    const lastRow = sheet.getLastRow();
    const ids =
      idAt >= 0 && lastRow > 1
        ? sheet
            .getRange(2, idAt + 1, lastRow - 1, 1)
            .getValues()
            .map((r) => String(r[0]))
        : [];
    return { sheet, columns, ids: new Set(ids) };
  }

  #create(name: string, year: number, header: string[]): Book {
    const ss = this.#env.g.SpreadsheetApp.create(name);
    const first = ss.getSheets()[0];
    const sheet = ss.insertSheet(TAB);
    if (first) ss.deleteSheet(first);
    const columns = header.filter(Boolean);
    const maxColumns = sheet.getMaxColumns();
    if (columns.length > maxColumns) {
      sheet.insertColumnsAfter(maxColumns, columns.length - maxColumns);
    }
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    sheet.setFrozenRows(1);
    sheet
      .protect()
      .setDescription(`Bitácora del portal de ${String(year)}: archivo, solo para consulta.`)
      .setWarningOnly(true);
    this.#env.g.DriveApp.getFileById(ss.getId()).moveTo(this.#folder);
    return { sheet, columns, ids: new Set() };
  }
}
