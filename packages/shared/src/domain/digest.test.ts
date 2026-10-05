import { describe, expect, it } from 'vitest';
import { uid } from '../testing/fixtures.ts';
import { agendaItems } from './agenda.ts';
import { digestOf, isEmptyDigest, waitingOnClient } from './digest.ts';
import { text, type Row } from './values.ts';

const TODAY = '2026-10-04';

const task = (n: number, fields: Record<string, unknown>): Row => ({
  id: uid(0x7a00 + n),
  clienteId: uid(0x7a99),
  estado: 'POR_HACER',
  deleted: null,
  ...fields,
});

const titles = (entries: { item: { titulo: string }; days: number }[]) =>
  entries.map((e) => `${e.item.titulo} ${String(e.days)}`);

describe('the daily summary', () => {
  it('tells what is overdue, what falls today and what a reminder day reaches', () => {
    const items = agendaItems(
      {
        Tareas: [
          task(1, { titulo: 'Vencida', fechaLimite: '2026-10-01' }),
          task(2, { titulo: 'Hoy', fechaLimite: '2026-10-04' }),
          task(3, { titulo: 'Mañana', fechaLimite: '2026-10-05' }),
          task(4, { titulo: 'En dos días', fechaLimite: '2026-10-06' }),
          task(5, { titulo: 'En una semana', fechaLimite: '2026-10-11' }),
          task(6, { titulo: 'Fatal en tres', fechaLimite: '2026-10-07', esFatal: true }),
          task(7, { titulo: 'Fatal en quince', fechaLimite: '2026-10-19', esFatal: true }),
          task(8, { titulo: 'Fatal en cuatro', fechaLimite: '2026-10-08', esFatal: true }),
        ],
      },
      { today: TODAY },
    );
    const d = digestOf(items, TODAY);
    expect(titles(d.overdue)).toEqual(['Vencida -3']);
    expect(titles(d.today)).toEqual(['Hoy 0']);
    expect(titles(d.soon)).toEqual([
      'Mañana 1',
      'Fatal en tres 3',
      'En una semana 7',
      'Fatal en quince 15',
    ]);
    expect(isEmptyDigest(d)).toBe(false);
  });

  it('leaves out what waits for the firm’s review, and past appointments', () => {
    const items = agendaItems(
      {
        Tareas: [task(1, { titulo: 'Revisión', estado: 'EN_REVISION', fechaLimite: '2026-10-01' })],
        Eventos: [
          task(2, {
            titulo: 'Junta pasada',
            tipo: 'REUNION',
            inicio: '2026-10-02T10:00:00.000-05:00',
          }),
          task(3, {
            titulo: 'Junta mañana',
            tipo: 'REUNION',
            inicio: '2026-10-05T10:00:00.000-05:00',
          }),
          task(4, {
            titulo: 'Audiencia en 7',
            tipo: 'AUDIENCIA',
            inicio: '2026-10-11T10:00:00.000-05:00',
          }),
        ],
      },
      { today: TODAY },
    );
    const d = digestOf(items, TODAY);
    expect(d.overdue).toEqual([]);
    expect(titles(d.soon)).toEqual(['Junta mañana 1', 'Audiencia en 7 7']);
  });

  it('has nothing to say on a quiet day', () => {
    const items = agendaItems(
      { Tareas: [task(1, { titulo: 'Lejos', fechaLimite: '2026-10-25' })] },
      { today: TODAY },
    );
    expect(isEmptyDigest(digestOf(items, TODAY))).toBe(true);
  });
});

describe('tasks waiting for the client', () => {
  it('reminds every few days, not every day', () => {
    const tareas = [
      task(1, {
        titulo: 'Tres',
        estado: 'EN_ESPERA_CLIENTE',
        enEsperaDesde: '2026-10-01T09:00:00.000-05:00',
      }),
      task(2, {
        titulo: 'Cuatro',
        estado: 'EN_ESPERA_CLIENTE',
        enEsperaDesde: '2026-09-30T09:00:00.000-05:00',
      }),
      task(3, {
        titulo: 'Seis',
        estado: 'EN_ESPERA_CLIENTE',
        enEsperaDesde: '2026-09-28T22:00:00.000-05:00',
      }),
      task(4, {
        titulo: 'Dos',
        estado: 'EN_ESPERA_CLIENTE',
        enEsperaDesde: '2026-10-02T09:00:00.000-05:00',
      }),
      task(5, {
        titulo: 'En curso',
        estado: 'EN_CURSO',
        enEsperaDesde: '2026-10-01T09:00:00.000-05:00',
      }),
      // No start date: the last change counts.
      task(6, {
        titulo: 'Sin fecha',
        estado: 'EN_ESPERA_CLIENTE',
        updatedAt: '2026-09-25T09:00:00.000-05:00',
      }),
    ];
    expect(
      waitingOnClient(tareas, TODAY, 3).map(
        (w) => `${text(w.task, 'titulo') ?? ''} ${String(w.days)}`,
      ),
    ).toEqual(['Sin fecha 9', 'Seis 6', 'Tres 3']);
    expect(waitingOnClient(tareas, TODAY, 0)).toEqual([]);
  });

  it('is something to say', () => {
    const waiting = waitingOnClient(
      [
        task(1, {
          titulo: 'Tres',
          estado: 'EN_ESPERA_CLIENTE',
          enEsperaDesde: '2026-10-01T09:00:00.000-05:00',
        }),
      ],
      TODAY,
      3,
    );
    expect(isEmptyDigest(digestOf([], TODAY, waiting))).toBe(false);
  });
});
