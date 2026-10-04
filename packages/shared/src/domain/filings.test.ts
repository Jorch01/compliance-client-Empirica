import { describe, expect, it } from 'vitest';
import { ID, demoData } from '../testing/fixtures.ts';
import { noticeDeadline, contractStatus, nextKeyDate } from './contracts.ts';
import {
  filingDate,
  isOpenFiling,
  moveToStage,
  parseHistory,
  parseStages,
  stageProgress,
  stageSince,
  stagesValue,
} from './filings.ts';
import { parsePerimeter, perimeterValue } from './retainer.ts';
import type { Row } from './values.ts';

const row = (rows: Row[], id: string): Row => {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe('filings and their stages', () => {
  const d = demoData();
  const template = row(d.PlantillasTramite, ID.plantilla);
  const stages = parseStages(template.etapas ?? null);

  it('reads a template’s stages, leaving out what is not one', () => {
    expect(stages.map((s) => s.nombre)).toEqual([
      'Integración del expediente',
      'Presentación',
      'Revisión de la autoridad',
      'Resolución',
    ]);
    expect(stages[3]?.dias).toBeNull();
    expect(parseStages([{ nombre: ' ' }, { dias: 3 }, 'x', { nombre: 'A', dias: -1 }])).toEqual([
      { nombre: 'A', dias: null },
    ]);
    expect(parseStages(null)).toEqual([]);
    expect(stagesValue(stages)).toEqual(template.etapas);
  });

  it('knows where a filing stands and since when', () => {
    const tramite = row(d.Tramites, ID.trNorte);
    expect(stageProgress(tramite, stages)).toEqual({
      index: 2,
      total: 4,
      next: { nombre: 'Resolución', dias: null },
    });
    expect(stageSince(tramite)).toBe('2026-09-16');
    // Off the template (or without one): no position, no next stage.
    const hub = row(d.Tramites, ID.trHub);
    expect(stageProgress(hub, stages)).toMatchObject({ index: -1, next: null });
    expect(stageSince(hub)).toBe('2026-09-28');
    // Not started: the template's first stage comes next.
    expect(stageProgress({ id: 'x', etapaActual: null }, stages).next?.nombre).toBe(
      'Integración del expediente',
    );
  });

  it('moving to a stage keeps the history and adds the new entry', () => {
    const tramite = row(d.Tramites, ID.trNorte);
    const moved = moveToStage(tramite, 'Resolución', '2026-10-04', ' Favorable ');
    expect(moved.etapaActual).toBe('Resolución');
    const history = parseHistory(moved.historialEtapas);
    expect(history).toHaveLength(4);
    expect(history.at(-1)).toEqual({ etapa: 'Resolución', fecha: '2026-10-04', nota: 'Favorable' });
    expect(
      parseHistory([
        { etapa: 'A', fecha: 'ayer' },
        { etapa: '', fecha: '2026-10-04' },
      ]),
    ).toEqual([]);
  });

  it('is open until concluded or cancelled; its date is the sooner one', () => {
    expect(isOpenFiling(row(d.Tramites, ID.trSur))).toBe(true);
    expect(isOpenFiling({ id: 'x', estado: 'CONCLUIDO' })).toBe(false);
    expect(isOpenFiling({ id: 'x', estado: 'CANCELADO' })).toBe(false);
    expect(filingDate(row(d.Tramites, ID.trNorte))).toBe('2026-10-20');
    expect(filingDate({ id: 'x', fechaLimite: '2026-10-08', proximaActuacion: '2026-10-20' })).toBe(
      '2026-10-08',
    );
    expect(filingDate({ id: 'x' })).toBeNull();
  });
});

describe('contract dates', () => {
  const d = demoData();
  const norte = row(d.Contratos, ID.ctNorte);

  it('puts the notice deadline the agreed days before the end', () => {
    expect(noticeDeadline(norte)).toBe('2026-10-16');
    expect(noticeDeadline({ ...norte, diasAvisoPrevio: null })).toBeNull();
    expect(noticeDeadline({ ...norte, vigenciaHasta: null })).toBeNull();
  });

  it('the next key date is the notice while ahead, then the end', () => {
    expect(nextKeyDate(norte, '2026-10-04')).toEqual({ date: '2026-10-16', kind: 'aviso' });
    expect(nextKeyDate(norte, '2026-10-20')).toEqual({ date: '2026-10-31', kind: 'vencimiento' });
    expect(nextKeyDate(norte, '2026-11-01')).toBeNull();
  });

  it('says whether it is in force, renewed or over', () => {
    expect(contractStatus(norte, '2026-10-04')).toBe('vigente');
    expect(contractStatus(norte, '2026-11-01')).toBe('renovado');
    expect(contractStatus({ ...norte, renovacionAutomatica: false }, '2026-11-01')).toBe('vencido');
    expect(contractStatus({ ...norte, vigenciaHasta: null }, '2026-11-01')).toBe('indefinido');
  });
});

describe('the retainer’s scope', () => {
  it('reads and writes what is covered and what is not', () => {
    const d = demoData();
    const p = parsePerimeter(row(d.Clientes, ID.clienteA).perimetroIguala ?? null);
    expect(p.cubiertos).toHaveLength(2);
    expect(p.excluidos).toEqual(['Juicios y litigios (ejemplo)']);
    expect(parsePerimeter('texto')).toEqual({ cubiertos: [], excluidos: [] });
    expect(perimeterValue({ cubiertos: [' A ', ''], excluidos: [] })).toEqual({
      cubiertos: ['A'],
      excluidos: [],
    });
    expect(perimeterValue({ cubiertos: [], excluidos: [' '] })).toBeNull();
  });
});
