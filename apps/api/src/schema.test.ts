/**
 * A new version of the backend may need a tab or a column the spreadsheet
 * does not have yet: the first request after the deploy creates it, so the
 * portal never breaks waiting for someone to run setup() by hand.
 */
import { ID } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { PROP } from './env.ts';
import { schemaPrint } from './setup.ts';
import { createWorld } from './testing/harness.ts';

describe('the spreadsheet follows the deployed data model', () => {
  it('setup records the model it brought the spreadsheet to', () => {
    const w = createWorld();
    expect(w.google.props.get(PROP.schemaVersion)).toBe(schemaPrint(w.env));
  });

  it('a deploy that adds a tab: the next request creates it before anything reads it', () => {
    const w = createWorld();
    const ss = w.google.spreadsheet();
    ss.deleteSheet(w.google.sheet('Sugerencias'));
    w.google.props.set(PROP.schemaVersion, 'version-anterior');

    const pulled = w.call('sync.pull', { cursor: 0 }, { as: ID.socio });
    expect(pulled.ok).toBe(true);
    expect(w.google.sheet('Sugerencias').grid[0]).toContain('mensaje');
    expect(w.google.props.get(PROP.schemaVersion)).toBe(schemaPrint(w.env));
  });

  it('a deploy that adds a column: it goes at the end and the data stays', () => {
    const w = createWorld();
    const sheet = w.google.sheet('Sugerencias');
    const header = sheet.grid[0] ?? [];
    // The previous version had no "respuesta" column.
    const at = header.indexOf('respuesta');
    for (const line of sheet.grid) line.splice(at, 1);
    w.google.props.set(PROP.schemaVersion, 'version-anterior');

    const own = w.ok<{ changes: { t: string; row: { id: string } }[] }>(
      'sync.pull',
      { cursor: 0 },
      { as: ID.cColab },
    );
    expect(own.changes.filter((c) => c.t === 'Sugerencias').map((c) => c.row.id)).toEqual([
      ID.sugColab,
    ]);
    expect(sheet.grid[0]?.at(-1)).toBe('respuesta');
    expect(w.row('Sugerencias', ID.sugColab)?.mensaje).toBe(
      'Sería útil ver los pendientes por fecha.',
    );
  });

  it('with the model unchanged, a request touches no tab and takes no lock', () => {
    const w = createWorld();
    const before = w.google.spreadsheet().getSheets().length;
    const locks = w.google.locksTaken;
    // Reading never takes the lock; checking the model must not either.
    w.ok('sync.pull', { cursor: 0 }, { as: ID.socio });
    expect(w.google.spreadsheet().getSheets()).toHaveLength(before);
    expect(w.google.locksTaken).toBe(locks);
  });
});
