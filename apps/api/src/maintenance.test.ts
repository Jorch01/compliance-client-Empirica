/**
 * Phase 7: the spreadsheet does not slow down with use. Saving adds to the
 * audit log without reading it, old notices go each night, and once a year
 * the past year's audit entries move to their own spreadsheet in Respaldos.
 */
import { isStaleNotice } from '@empirica/shared';
import { ID } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { Database } from './db/database.ts';
import { PROP } from './env.ts';
import { ApiError } from './errors.ts';
import {
  AUDIT_ARCHIVE_PREFIX,
  archiveAuditLog,
  purgeOldNotices,
  runNightly,
} from './maintenance.ts';
import { Device, op } from './testing/device.ts';
import { START, createWorld, type World } from './testing/harness.ts';

const DAY = 86_400_000;

/** Audit entries as the writer leaves them, all at one moment. */
function fillAuditLog(w: World, count: number, createdAt: string, prefix = 'old'): void {
  const db = new Database(w.env);
  const log = db.table('Bitacora');
  for (let i = 0; i < count; i++) {
    log.put({
      id: `${prefix}-${String(i)}`,
      createdAt,
      createdBy: ID.abogado,
      usuarioId: ID.abogado,
      accion: 'EDITAR',
      entidad: 'Tareas',
      entidadId: ID.tNorte1,
      antes: { estado: 'POR_HACER' },
      despues: { estado: 'EN_CURSO' },
      clienteId: ID.clienteA,
    });
  }
  db.flush();
}

describe('saving with a long audit log', () => {
  it('adds each entry at the end without reading the log', () => {
    const w = createWorld();
    fillAuditLog(w, 5_000, '2026-09-01T10:00:00.000-05:00');
    const sheet = w.google.sheet('Bitacora');
    const before = { cells: sheet.cellsRead, rows: sheet.getLastRow() };
    const lawyer = new Device(w, ID.abogado);

    expect(lawyer.push([op('Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' })])).toMatchObject(
      [{ status: 'applied' }],
    );
    expect(
      lawyer.push([op('Tareas', 'update', ID.tNorte1, { estado: 'EN_REVISION' }, { at: START })]),
    ).toMatchObject([{ status: 'applied' }]);

    // Only the header, once per request: never the 5,000 entries.
    expect(sheet.cellsRead - before.cells).toBe(2 * sheet.getLastColumn());
    // Each entry right after the last one, none over another.
    const all = w.rows('Bitacora');
    expect(sheet.getLastRow()).toBe(all.length + 1);
    expect(all.filter((b) => b.id.startsWith('old-'))).toHaveLength(5_000);
    expect(all.slice(before.rows - 1)).toEqual([
      expect.objectContaining({ accion: 'EDITAR', despues: { estado: 'EN_CURSO' } }),
      expect.objectContaining({ accion: 'SISTEMA', entidad: 'Asuntos' }),
      expect.objectContaining({ accion: 'EDITAR', despues: { estado: 'EN_REVISION' } }),
    ]);
  });

  it('a request that already read the log writes through that copy', () => {
    const w = createWorld();
    const db = new Database(w.env);
    const count = db.rows('Bitacora').length;
    db.append('Bitacora', { id: 'a1', accion: 'EDITAR', entidad: 'Tareas' });
    db.append('Bitacora', { id: 'a2', accion: 'EDITAR', entidad: 'Tareas' });
    db.flush();
    expect(w.rows('Bitacora').map((b) => b.id)).toHaveLength(count + 2);
    expect(w.rows('Bitacora').at(-1)?.id).toBe('a2');
  });

  it('never reads a log while adding to it unread', () => {
    const w = createWorld();
    const db = new Database(w.env);
    db.append('Bitacora', { id: 'a1', accion: 'EDITAR', entidad: 'Tareas' });
    expect(() => db.table('Bitacora')).toThrow(ApiError);
    db.flush();
    expect(new Database(w.env).table('Bitacora').get('a1')).toBeDefined();
  });
});

describe('old notices', () => {
  // The demo notices were created on 2026-09-01 at 10:00.
  it('go each night: read, after 60 days; never read, after a year', () => {
    const w = createWorld();
    const demo = w.rows('Notificaciones').length;
    const colab = new Device(w, ID.cColab);
    expect(colab.push([op('Notificaciones', 'update', ID.notifColab, { leida: true })])).toEqual([
      expect.objectContaining({ status: 'applied' }),
    ]);
    colab.sync();
    w.clock.set('2026-10-31T10:00:00.000-05:00');
    expect(purgeOldNotices(w.env)).toBe(0);
    w.clock.set('2026-11-01T10:00:00.000-05:00');
    expect(purgeOldNotices(w.env)).toBe(1);
    expect(w.row('Notificaciones', ID.notifColab)).toBeUndefined();
    expect(w.rows('Notificaciones')).toHaveLength(demo - 1);
    // Nobody is told: each device drops it by the same rule.
    expect(colab.sync().last.removed).toEqual([]);
    const copy = colab.get('Notificaciones', ID.notifColab);
    expect(copy && isStaleNotice(copy, w.clock.now())).toBe(true);

    expect(w.row('Notificaciones', ID.notifB)?.leida).toBe(false);
    w.clock.set('2027-08-31T10:00:00.000-05:00');
    expect(purgeOldNotices(w.env)).toBe(0);
    w.clock.set('2027-09-02T10:00:00.000-05:00');
    expect(purgeOldNotices(w.env)).toBe(1);
    expect(w.row('Notificaciones', ID.notifB)).toBeUndefined();
  });

  it('marking read one already gone answers that it does not exist (the device drops it)', () => {
    const w = createWorld();
    w.edit('Notificaciones', ID.notifColab, { leida: true });
    w.clock.set('2026-11-02T10:00:00.000-05:00');
    expect(runNightly(w.env).purgedNotices).toBe(1);
    // Another device of the person still had it unread.
    expect(
      new Device(w, ID.cColab).push([
        op('Notificaciones', 'update', ID.notifColab, { leida: true }),
      ]),
    ).toMatchObject([{ status: 'rejected', code: 'NOT_FOUND' }]);
  });
});

describe('the yearly audit archive', () => {
  const archives = (w: World) =>
    [...w.google.files.values()].filter(
      (f) => !f.trashed && f.name.startsWith(AUDIT_ARCHIVE_PREFIX),
    );
  const archived = (w: World, year: string) => {
    const file = archives(w).find((f) => f.name === `${AUDIT_ARCHIVE_PREFIX}${year}`);
    return w.google.spreadsheets.get(file?.id ?? '')?.getSheetByName('Bitacora');
  };
  const ids = (w: World) => w.rows('Bitacora').map((b) => b.id);
  const NEW_YEAR = '2027-01-01T03:00:00.000-05:00';

  it('the first night only remembers there is nothing from past years', () => {
    const w = createWorld();
    expect(archiveAuditLog(w.env)).toEqual({});
    expect(w.google.props.get(PROP.auditArchivedYear)).toBe('2025');
    expect(archives(w)).toEqual([]);
    // Then, all year, it does not even read the log.
    const sheet = w.google.sheet('Bitacora');
    const cells = sheet.cellsRead;
    w.clock.advance(60 * DAY);
    expect(archiveAuditLog(w.env)).toEqual({});
    expect(sheet.cellsRead).toBe(cells);
  });

  it('on New Year’s night the past year moves to its own spreadsheet in Respaldos', () => {
    const w = createWorld();
    archiveAuditLog(w.env);
    fillAuditLog(w, 1_200, '2026-12-31T23:59:00.000-05:00');
    const pastYear = ids(w);
    w.clock.set('2027-01-01T00:30:00.000-05:00');
    new Device(w, ID.abogado).push([op('Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' })]);
    const thisYear = ids(w).slice(pastYear.length);
    expect(thisYear.length).toBeGreaterThan(0);
    const sheet = w.google.sheet('Bitacora');
    const rowsBefore = sheet.getMaxRows();
    w.clock.set(NEW_YEAR);

    expect(runNightly(w.env).archivedAudit).toEqual({ '2026': pastYear.length });
    const [file] = archives(w);
    expect(file?.name).toBe(`${AUDIT_ARCHIVE_PREFIX}2026`);
    expect(file?.parent?.id).toBe(w.google.props.get(PROP.backupsFolderId));
    const tab = archived(w, '2026');
    expect(tab?.records().map((r) => r.id)).toEqual(pastYear);
    // Cell by cell, as the live tab had it.
    expect(tab?.records().find((r) => r.id === 'old-0')).toMatchObject({
      accion: 'EDITAR',
      entidad: 'Tareas',
      createdAt: '2026-12-31T23:59:00.000-05:00',
      despues: '{"estado":"EN_CURSO"}',
    });
    expect(tab?.protections).toHaveLength(1);

    // The live log keeps this year's: the rows went, they were not just emptied.
    expect(ids(w)).toEqual(thisYear);
    expect(sheet.getMaxRows()).toBe(rowsBefore - pastYear.length);
    expect(w.google.props.get(PROP.auditArchivedYear)).toBe('2026');
    // And goes on right after them.
    new Device(w, ID.abogado).push([
      op('Tareas', 'update', ID.tNorte1, { estado: 'EN_REVISION' }, { at: NEW_YEAR }),
    ]);
    expect(ids(w).length).toBeGreaterThan(thisYear.length);
    expect(ids(w).slice(0, thisYear.length)).toEqual(thisYear);
    expect(sheet.getLastRow()).toBe(ids(w).length + 1);

    // Done for the year.
    w.clock.advance(DAY);
    expect(archiveAuditLog(w.env)).toEqual({});
    expect(archives(w)).toHaveLength(1);
  });

  it('moves a big log a chunk at a time, down to an empty tab', () => {
    const w = createWorld();
    fillAuditLog(w, 1_200, '2026-06-01T10:00:00.000-05:00');
    const pastYear = ids(w);
    w.clock.set(NEW_YEAR);
    expect(archiveAuditLog(w.env, { chunk: 500 })).toEqual({ '2026': pastYear.length });
    expect(
      archived(w, '2026')
        ?.records()
        .map((r) => r.id),
    ).toEqual(pastYear);
    expect(ids(w)).toEqual([]);
    // The next entry goes right under the header.
    new Device(w, ID.abogado).push([
      op('Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' }, { at: NEW_YEAR }),
    ]);
    expect(w.google.sheet('Bitacora').getLastRow()).toBe(ids(w).length + 1);
  });

  it('a night that failed between the copy and the deletion is finished without repeating entries', () => {
    const w = createWorld();
    fillAuditLog(w, 30, '2026-06-01T10:00:00.000-05:00');
    const pastYear = ids(w);
    w.clock.set(NEW_YEAR);
    const sheet = w.google.sheet('Bitacora');
    const deleteRows = sheet.deleteRows.bind(sheet);
    sheet.deleteRows = () => {
      throw new Error('Service Spreadsheets timed out');
    };
    expect(() => archiveAuditLog(w.env)).toThrow('timed out');
    sheet.deleteRows = deleteRows;
    expect(w.google.props.get(PROP.auditArchivedYear)).toBeUndefined();
    expect(ids(w)).toEqual(pastYear);
    expect(archived(w, '2026')?.records()).toHaveLength(pastYear.length);

    expect(archiveAuditLog(w.env)).toEqual({ '2026': pastYear.length });
    expect(archives(w)).toHaveLength(1);
    expect(
      archived(w, '2026')
        ?.records()
        .map((r) => r.id),
    ).toEqual(pastYear);
    expect(ids(w)).toEqual([]);
  });

  it('an entry from before midnight written after one from the new year waits a year', () => {
    const w = createWorld({ data: null });
    const db = new Database(w.env);
    const log = db.table('Bitacora');
    const entry = (id: string, createdAt: string) => ({ id, createdAt, accion: 'EDITAR' });
    log.put(entry('a', '2026-12-31T23:59:58.000-05:00'));
    log.put(entry('b', '2027-01-01T00:00:01.000-05:00'));
    log.put(entry('c', '2026-12-31T23:59:59.000-05:00'));
    db.flush();
    const setupEntries = ids(w).filter((id) => !['a', 'b', 'c'].includes(id));
    w.clock.set(NEW_YEAR);
    archiveAuditLog(w.env);
    expect(ids(w)).toEqual(['b', 'c']);
    expect(
      archived(w, '2026')
        ?.records()
        .map((r) => r.id),
    ).toEqual([...setupEntries, 'a']);

    w.clock.set('2028-01-01T03:00:00.000-05:00');
    expect(archiveAuditLog(w.env)).toEqual({ '2026': 1, '2027': 1 });
    expect(
      archived(w, '2026')
        ?.records()
        .map((r) => r.id),
    ).toEqual([...setupEntries, 'a', 'c']);
    expect(
      archived(w, '2027')
        ?.records()
        .map((r) => r.id),
    ).toEqual(['b']);
    expect(ids(w)).toEqual([]);
  });

  it('copies text as text: nothing becomes a formula or a number', () => {
    const w = createWorld({ data: null });
    const db = new Database(w.env);
    db.table('Bitacora').put({
      id: 'x',
      createdAt: '2026-05-05T10:00:00.000-05:00',
      accion: 'EDITAR',
      usuarioId: '007',
      entidadId: '=IMPORTXML("http://example.com","//a")',
      despues: { estado: 'TRUE' },
    });
    db.flush();
    const formulas = w.google.formulas.length;
    w.clock.set(NEW_YEAR);
    archiveAuditLog(w.env);
    expect(
      archived(w, '2026')
        ?.records()
        .find((r) => r.id === 'x'),
    ).toMatchObject({
      usuarioId: '007',
      entidadId: '=IMPORTXML("http://example.com","//a")',
      despues: '{"estado":"TRUE"}',
    });
    expect(w.google.formulas.length).toBe(formulas);
  });

  it('a night that runs out of time leaves the rest for the next one', () => {
    const w = createWorld();
    w.clock.set(NEW_YEAR);
    expect(archiveAuditLog(w.env, { budgetMs: -1 })).toEqual({});
    expect(w.google.props.get(PROP.auditArchivedYear)).toBeUndefined();
    expect(ids(w).length).toBeGreaterThan(0);
  });
});
