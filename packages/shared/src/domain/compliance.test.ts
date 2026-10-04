import { describe, expect, it } from 'vitest';
import { ID, demoData, uid } from '../testing/fixtures.ts';
import {
  cellLevel,
  complianceMatrix,
  currentPeriod,
  firstOpenPeriod,
  matrixTotals,
  monthsOfYear,
  nonWorkingDays,
  obligationState,
  periodsOf,
  type MatrixCell,
} from './compliance.ts';
import { CATEGORIAS_OBLIGACION } from './enums.ts';
import type { Row } from './values.ts';

const TODAY = '2026-10-04';
const NONE = new Set<string>();

function data() {
  const d = demoData();
  const ob = (id: string): Row => {
    const row = d.Obligaciones.find((o) => o.id === id);
    if (!row) throw new Error(id);
    return row;
  };
  return { d, ob, records: d.CumplimientosHistorial };
}

const record = (obligacionId: string, periodo: string, estado: string, n: number): Row => ({
  id: uid(0x9900 + n),
  obligacionId,
  periodo,
  estado,
  createdAt: `${periodo}T12:00:00.000-05:00`,
  deleted: null,
});

const summary = (periods: ReturnType<typeof periodsOf>) =>
  periods.map((p) => `${p.periodo}>${p.vence} ${p.estado}${p.rechazado ? ' rechazado' : ''}`);

describe('the periods of an obligation', () => {
  it('shows the history before the next due date and every period from it on', () => {
    const { ob, records } = data();
    expect(
      summary(periodsOf(ob(ID.obNorte), records, '2026-01-01', '2026-12-31', TODAY, NONE)),
    ).toEqual([
      '2026-07-12>2026-07-12 cumplido',
      '2026-08-12>2026-08-12 cumplido',
      '2026-09-12>2026-09-12 revision',
      '2026-10-12>2026-10-12 pendiente',
      '2026-11-12>2026-11-12 pendiente',
      '2026-12-12>2026-12-12 pendiente',
    ]);
  });

  it('moves due dates past weekends and non-working days, and marks a rejection', () => {
    const { ob, records } = data();
    expect(
      summary(periodsOf(ob(ID.obInterna), records, '2026-08-01', '2026-10-31', TODAY, NONE)),
    ).toEqual([
      // A Sunday: due on Monday.
      '2026-08-23>2026-08-24 vencido rechazado',
      '2026-09-23>2026-09-23 vencido',
      '2026-10-23>2026-10-23 pendiente',
    ]);
    // The last day of October 2026 is a Saturday.
    expect(
      summary(
        periodsOf(
          ob(ID.obSur),
          records,
          '2026-01-01',
          '2027-12-31',
          TODAY,
          new Set(['2026-11-02']),
        ),
      ),
    ).toEqual(['2026-10-31>2026-11-03 pendiente', '2027-10-31>2027-11-01 pendiente']);
  });

  it('gives a one-time obligation one period, due soon here', () => {
    const { ob, records } = data();
    expect(
      summary(periodsOf(ob(ID.obHub), records, '2026-01-01', '2026-12-31', TODAY, NONE)),
    ).toEqual(['2026-10-09>2026-10-09 porVencer']);
  });

  it('counts the date the firm wrote even when it is off the rule’s day', () => {
    const { ob, records } = data();
    const off = { ...ob(ID.obNorte), id: uid(0x9800), proximoVencimiento: '2026-10-20' };
    expect(
      summary(periodsOf(off, records, '2026-10-01', '2026-11-30', TODAY, NONE)).map((s) =>
        s.slice(0, 10),
      ),
    ).toEqual(['2026-10-20', '2026-11-12']);
  });

  it('has none while inactive, deleted or without a date', () => {
    const { ob, records } = data();
    for (const o of [
      { ...ob(ID.obNorte), estado: 'INACTIVA' },
      { ...ob(ID.obNorte), deleted: '2026-10-01T10:00:00.000-05:00' },
      { ...ob(ID.obNorte), proximoVencimiento: null },
    ]) {
      expect(periodsOf(o, records, '2026-01-01', '2026-12-31', TODAY, NONE)).toEqual([]);
    }
  });
});

describe('what an obligation needs now', () => {
  it('is its first period not validated', () => {
    const { ob, records } = data();
    expect(currentPeriod(ob(ID.obNorte), records, TODAY, NONE)).toMatchObject({
      periodo: '2026-09-12',
      estado: 'revision',
    });
    expect(obligationState(ob(ID.obHub), records, TODAY, NONE)).toMatchObject({
      estado: 'porVencer',
    });
  });

  it('a one-time obligation, once validated, is complied with', () => {
    const { ob, records } = data();
    const done = [...records, record(ID.obHub, '2026-10-09', 'VALIDADO', 1)];
    expect(currentPeriod(ob(ID.obHub), done, TODAY, NONE)).toBeNull();
    expect(obligationState(ob(ID.obHub), done, TODAY, NONE)).toEqual({
      estado: 'cumplida',
      period: null,
    });
    expect(obligationState({ ...ob(ID.obHub), estado: 'INACTIVA' }, done, TODAY, NONE).estado).toBe(
      'inactiva',
    );
  });
});

describe('where the next due date goes (server)', () => {
  it('forward past what was validated', () => {
    const { ob, records } = data();
    const validated = records.map((r) => (r.id === ID.cuNorte ? { ...r, estado: 'VALIDADO' } : r));
    expect(firstOpenPeriod(ob(ID.obNorte), validated)).toBe('2026-10-12');
    const ahead = [...validated, record(ID.obNorte, '2026-10-12', 'VALIDADO', 2)];
    expect(firstOpenPeriod(ob(ID.obNorte), ahead)).toBe('2026-11-12');
  });

  it('stays while nothing new was validated', () => {
    const { ob, records } = data();
    expect(firstOpenPeriod(ob(ID.obNorte), records)).toBe('2026-09-12');
    const rejected = records.map((r) => (r.id === ID.cuNorte ? { ...r, estado: 'RECHAZADO' } : r));
    expect(firstOpenPeriod(ob(ID.obNorte), rejected)).toBe('2026-09-12');
  });

  it('back to a period whose validation was withdrawn', () => {
    const { ob, records } = data();
    const withdrawn = records.map((r) =>
      r.id === ID.cuNorteAgo ? { ...r, estado: 'RECHAZADO' } : r,
    );
    expect(firstOpenPeriod(ob(ID.obNorte), withdrawn, ['2026-08-12'])).toBe('2026-08-12');
    // Another validated record of that period keeps it complied with.
    const twice = [...withdrawn, record(ID.obNorte, '2026-08-12', 'VALIDADO', 3)];
    expect(firstOpenPeriod(ob(ID.obNorte), twice, ['2026-08-12'])).toBe('2026-09-12');
  });

  it('a one-time obligation keeps its only date', () => {
    const { ob, records } = data();
    const done = [...records, record(ID.obHub, '2026-10-09', 'VALIDADO', 4)];
    expect(firstOpenPeriod(ob(ID.obHub), done)).toBeNull();
  });
});

describe('the compliance matrix', () => {
  const months = monthsOfYear(2026);
  const ofA = () => {
    const { d, records } = data();
    const obligaciones = d.Obligaciones.filter((o) => o.clienteId === ID.clienteA);
    return complianceMatrix(obligaciones, records, CATEGORIAS_OBLIGACION, months, TODAY, NONE);
  };
  const cell = (rows: ReturnType<typeof ofA>, categoria: string, month: string): MatrixCell => {
    const found = rows.find((r) => r.categoria === categoria)?.cells.find((c) => c.month === month);
    if (!found) throw new Error(`${categoria} ${month}`);
    return found;
  };

  it('has a row per category with obligations, in the given order, and twelve months', () => {
    const rows = ofA();
    expect(rows.map((r) => r.categoria)).toEqual([
      'CORPORATIVO',
      'FISCAL',
      'LABORAL_SEGURIDAD_SOCIAL',
      'LICENCIAS_REGULATORIO',
    ]);
    expect(rows.every((r) => r.cells.length === 12)).toBe(true);
    expect(months[0]).toBe('2026-01');
    expect(months[11]).toBe('2026-12');
  });

  it('counts each period in its month by its state', () => {
    const rows = ofA();
    expect(cell(rows, 'LICENCIAS_REGULATORIO', '2026-07')).toMatchObject({ total: 1, cumplido: 1 });
    expect(cell(rows, 'LICENCIAS_REGULATORIO', '2026-09')).toMatchObject({ total: 1, revision: 1 });
    expect(cell(rows, 'LICENCIAS_REGULATORIO', '2026-03')).toMatchObject({ total: 0 });
    expect(cell(rows, 'FISCAL', '2026-08')).toMatchObject({ total: 1, vencido: 1 });
    expect(cell(rows, 'CORPORATIVO', '2026-10')).toMatchObject({ total: 1, porVencer: 1 });
    const items = cell(rows, 'LICENCIAS_REGULATORIO', '2026-09').items;
    expect(items.map((i) => i.obligacion.id)).toEqual([ID.obNorte]);
  });

  it('adds every category up in the last row', () => {
    const rows = ofA();
    const totals = matrixTotals(rows, months);
    const october = totals.find((c) => c.month === '2026-10');
    // Licencias (12th), Fiscal (23rd), Laboral (31st) and the one-time Corporativo.
    expect(october).toMatchObject({ total: 4, porVencer: 1, pendiente: 3 });
  });

  it('colors a cell by the share of its due periods that were validated', () => {
    const base = { month: '2026-01', total: 0, porVencer: 0, pendiente: 0, items: [] };
    const level = (cumplido: number, revision: number, vencido: number) =>
      cellLevel({ ...base, cumplido, revision, vencido });
    expect(level(4, 0, 0)).toBe(4);
    expect(level(9, 1, 0)).toBe(3);
    expect(level(5, 0, 5)).toBe(2);
    expect(level(1, 2, 2)).toBe(1);
    expect(level(0, 0, 0)).toBeNull();
    const rows = ofA();
    expect(cellLevel(cell(rows, 'LICENCIAS_REGULATORIO', '2026-07'))).toBe(4);
    expect(cellLevel(cell(rows, 'LICENCIAS_REGULATORIO', '2026-09'))).toBe(1);
    expect(cellLevel(cell(rows, 'LICENCIAS_REGULATORIO', '2026-11'))).toBeNull();
  });

  it('reads the firm’s non-working days', () => {
    const { d } = data();
    expect([...nonWorkingDays(d.DiasInhabiles)]).toEqual(['2026-11-16']);
    expect(
      nonWorkingDays([{ id: 'x', fecha: '2026-12-25', deleted: '2026-10-01T00:00:00.000-05:00' }])
        .size,
    ).toBe(0);
  });
});
