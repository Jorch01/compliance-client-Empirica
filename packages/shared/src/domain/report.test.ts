import { describe, expect, it } from 'vitest';
import { z } from 'zod/mini';
import { clientViewRows } from '../permissions/viewer.ts';
import { ID, demoData, uid, type Dataset } from '../testing/fixtures.ts';
import type { TableName } from './tables.ts';
import {
  DEFAULT_HEALTH_WEIGHTS,
  healthIndex,
  parseHealthWeights,
  type HealthOptions,
} from './health.ts';
import {
  MAX_PENDING_TASKS,
  REPORT_TABLES,
  buildReport,
  periodBounds,
  previousPeriod,
  reportId,
  type ReportOptions,
} from './report.ts';
import type { Row } from './values.ts';

const TODAY = '2026-10-05';
const CLIENT = uid(0x7701);

const row = (n: number, fields: Record<string, unknown>): Row => ({
  id: uid(0x7900 + n),
  clienteId: CLIENT,
  deleted: null,
  ...fields,
});

const HEALTH: HealthOptions = {
  today: TODAY,
  inhabiles: new Set(),
  weights: DEFAULT_HEALTH_WEIGHTS,
  waitingDays: 3,
};

const OPTIONS: ReportOptions = {
  clienteId: CLIENT,
  periodo: '2026-09',
  today: TODAY,
  inhabiles: new Set(),
  weights: DEFAULT_HEALTH_WEIGHTS,
  waitingDays: 3,
};

describe('the month of a report', () => {
  it('knows its first and last day, and which month a report prepared today covers', () => {
    expect(periodBounds('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(previousPeriod('2026-10-05')).toBe('2026-09');
    expect(previousPeriod('2027-01-01')).toBe('2026-12');
  });

  it('has one id per client and month, the same on every device', () => {
    const id = reportId(ID.clienteA, '2026-09');
    expect(z.uuid().safeParse(id).success).toBe(true);
    expect(reportId(ID.clienteA, '2026-09')).toBe(id);
    expect(reportId(ID.clienteA, '2026-10')).not.toBe(id);
    expect(reportId(ID.clienteB, '2026-09')).not.toBe(id);
  });
});

describe('the health index', () => {
  it('takes points away for what needs attention, by the weights', () => {
    const data = {
      Tareas: [
        row(1, { estado: 'POR_HACER', fechaLimite: '2026-10-01' }), // overdue
        row(2, { estado: 'EN_REVISION', fechaLimite: '2026-10-01' }), // the firm has it
        row(3, { estado: 'EN_CURSO', fechaLimite: '2026-10-08', esFatal: true }), // fatal soon
        row(4, {
          estado: 'EN_ESPERA_CLIENTE',
          enEsperaDesde: '2026-09-25T10:00:00.000-05:00',
        }), // waiting 10 days
        row(5, { estado: 'HECHO', fechaLimite: '2026-09-01' }), // done: nothing
      ],
      Tramites: [
        row(6, {
          estado: 'EN_TRAMITE',
          etapaActual: 'Revisión',
          historialEtapas: [{ etapa: 'Revisión', fecha: '2026-08-01' }],
        }),
      ],
    };
    const index = healthIndex(data, HEALTH);
    const points = Object.fromEntries(index.parts.map((p) => [p.factor, p.count]));
    expect(points).toEqual({
      obligacionVencida: 0,
      fatalProximo: 1,
      tareaVencida: 1,
      tramiteDetenido: 1,
      esperaCliente: 1,
    });
    expect(index.score).toBe(100 - 8 - 5 - 4 - 2);
    expect(index.band).toBe('good');
    expect(healthIndex({}, HEALTH)).toMatchObject({ score: 100, band: 'good' });
  });

  it('reads the partner’s weights, keeping the default for anything invalid', () => {
    expect(parseHealthWeights('{"tareaVencida": 20, "fatalProximo": -3, "otro": 1}')).toEqual({
      ...DEFAULT_HEALTH_WEIGHTS,
      tareaVencida: 20,
    });
    expect(parseHealthWeights('no es json')).toEqual(DEFAULT_HEALTH_WEIGHTS);
    const many = Array.from({ length: 30 }, (_, i) =>
      row(100 + i, { estado: 'POR_HACER', fechaLimite: '2026-09-01' }),
    );
    expect(healthIndex({ Tareas: many }, HEALTH)).toMatchObject({ score: 0, band: 'risk' });
  });
});

describe('the monthly report', () => {
  it('lists the month’s closed tasks and what stays open, soonest first', () => {
    const report = buildReport(
      {
        Asuntos: [
          row(1, { titulo: 'Constitución', area: 'CORPORATIVO', estado: 'ACTIVO' }),
          row(2, {
            titulo: 'Marca',
            area: 'PROPIEDAD_INTELECTUAL',
            estado: 'CONCLUIDO',
            fechaCierre: '2026-09-20',
          }),
          row(3, {
            titulo: 'Viejo',
            area: 'CORPORATIVO',
            estado: 'CONCLUIDO',
            fechaCierre: '2026-07-01',
          }),
        ],
        Tareas: [
          row(10, {
            titulo: 'Acta',
            asuntoId: uid(0x7901),
            estado: 'HECHO',
            fechaCierre: '2026-09-10',
          }),
          row(11, {
            titulo: 'Poder',
            asuntoId: uid(0x7901),
            estado: 'HECHO',
            fechaCierre: '2026-08-30',
          }),
          row(12, {
            titulo: 'Firma',
            asuntoId: uid(0x7901),
            estado: 'POR_HACER',
            fechaLimite: '2026-10-20',
          }),
          row(13, {
            titulo: 'Pago',
            asuntoId: uid(0x7901),
            estado: 'POR_HACER',
            fechaLimite: '2026-10-01',
          }),
          row(14, { titulo: 'Sin fecha', estado: 'EN_CURSO' }),
        ],
        Solicitudes: [
          row(20, {
            titulo: 'Revisar NDA',
            estado: 'DENTRO_IGUALA',
            createdAt: '2026-09-03T09:00:00.000-05:00',
          }),
          row(21, {
            titulo: 'De agosto',
            estado: 'RECIBIDA',
            createdAt: '2026-08-31T09:00:00.000-05:00',
          }),
        ],
      },
      OPTIONS,
    );
    expect(report.asuntos.map((a) => [a.titulo, a.avance, a.concluido])).toEqual([
      // Two of its four tasks are done.
      ['Constitución', 50, false],
      ['Marca', null, true],
    ]);
    expect(report.tareasCerradas.map((t) => [t.titulo, t.fecha])).toEqual([['Acta', '2026-09-10']]);
    expect(report.tareasPendientes.map((t) => [t.titulo, t.light])).toEqual([
      ['Pago', 'overdue'],
      ['Firma', 'onTime'],
      ['Sin fecha', 'noDate'],
    ]);
    expect(report.counts).toMatchObject({
      tareasCerradas: 1,
      tareasAbiertas: 3,
      vencidas: 1,
      asuntosActivos: 1,
    });
    expect(report.solicitudes.map((s) => s.titulo)).toEqual(['Revisar NDA']);
  });

  it('caps the open tasks it lists and counts the rest', () => {
    const tareas = Array.from({ length: MAX_PENDING_TASKS + 4 }, (_, i) =>
      row(200 + i, { titulo: `T${String(i)}`, estado: 'POR_HACER' }),
    );
    const report = buildReport({ Tareas: tareas }, OPTIONS);
    expect(report.tareasPendientes).toHaveLength(MAX_PENDING_TASKS);
    expect(report.pendientesOmitidas).toBe(4);
  });

  it('carries the month’s compliance periods, earlier overdue ones flagged', () => {
    const report = buildReport(
      {
        Obligaciones: [
          row(30, {
            nombre: 'Declaración (ejemplo)',
            categoria: 'FISCAL',
            recurrencia: 'FREQ=MONTHLY;BYMONTHDAY=17',
            proximoVencimiento: '2026-08-17',
            estado: 'ACTIVA',
          }),
        ],
        CumplimientosHistorial: [],
      },
      OPTIONS,
    );
    expect(report.cumplimiento).toEqual([
      {
        categoria: 'FISCAL',
        periodos: [
          expect.objectContaining({ periodo: '2026-08-17', estado: 'vencido', atrasado: true }),
          expect.objectContaining({ periodo: '2026-09-17', estado: 'vencido', atrasado: false }),
        ],
      },
    ]);
    expect(report.counts).toMatchObject({ periodosDelMes: 1, periodosCumplidos: 0 });
  });

  it('made from what a user of the whole client sees, carries nothing internal nor another client’s', () => {
    const data: Dataset = demoData();
    const lookup = {
      get: (table: TableName, id: string): Row | undefined => data[table].find((r) => r.id === id),
    };
    const source = Object.fromEntries(REPORT_TABLES.map((t) => [t, data[t]]));
    const visible = clientViewRows(source, ID.clienteA, lookup);
    const report = buildReport(visible, { ...OPTIONS, clienteId: ID.clienteA });
    const ids = JSON.stringify(report);
    for (const internal of [
      ID.asInterno,
      ID.tInterna,
      ID.tBajoInterno,
      ID.obInterna,
      ID.asB,
      ID.tB,
    ]) {
      expect(ids).not.toContain(internal);
    }
    expect(report.asuntos.length).toBeGreaterThan(0);
    expect(report.tareasPendientes.map((t) => t.titulo)).toContain('Entregar acta constitutiva');
  });
});
