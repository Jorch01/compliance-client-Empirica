import { describe, expect, it } from 'vitest';
import { ID, demoData, uid } from '../testing/fixtures.ts';
import { agendaItems, daysUntil, parseDays, type AgendaItem } from './agenda.ts';
import type { Row } from './values.ts';

const TODAY = '2026-10-04';
const CLIENT = uid(0x7701);

const row = (n: number, fields: Record<string, unknown>): Row => ({
  id: uid(0x7800 + n),
  clienteId: CLIENT,
  deleted: null,
  ...fields,
});

const summary = (items: AgendaItem[]) =>
  items.map(
    (i) =>
      `${i.date} ${i.key.replace(/[0-9a-f-]{36}/g, '#')} ${i.tipo}${i.fatal ? ' fatal' : ''}` +
      `${i.detalle ? ` ${i.detalle}` : ''}${i.enRevision ? ' revision' : ''} [${i.reminders.join(',')}]`,
  );

describe('the agenda', () => {
  it('lists the open tasks by their deadline, fatal ones with their own reminders', () => {
    const items = agendaItems(
      {
        Tareas: [
          row(1, {
            titulo: 'Contestar demanda',
            estado: 'EN_CURSO',
            fechaLimite: '2026-10-20',
            esFatal: true,
          }),
          row(2, { titulo: 'Firmar acta', estado: 'POR_HACER', fechaLimite: '2026-10-08' }),
          row(3, { titulo: 'Revisar', estado: 'EN_REVISION', fechaLimite: '2026-10-09' }),
          row(4, { titulo: 'Hecha', estado: 'HECHO', fechaLimite: '2026-10-10' }),
          row(5, {
            titulo: 'Borrada',
            estado: 'POR_HACER',
            fechaLimite: '2026-10-10',
            deleted: '2026-10-01T00:00:00Z',
          }),
          row(6, { titulo: 'Sin fecha', estado: 'POR_HACER' }),
        ],
      },
      { today: TODAY },
    );
    expect(summary(items)).toEqual([
      '2026-10-08 Tareas:# VENCIMIENTO [7,1]',
      '2026-10-09 Tareas:# VENCIMIENTO revision [7,1]',
      '2026-10-20 Tareas:# VENCIMIENTO fatal [15,7,3,1]',
    ]);
    expect(items.every((i) => !i.movable && i.start === null)).toBe(true);
  });

  it('takes the reminders from the firm settings', () => {
    const items = agendaItems(
      {
        Tareas: [
          row(1, { titulo: 'A', estado: 'POR_HACER', fechaLimite: '2026-10-20', esFatal: true }),
          row(2, { titulo: 'B', estado: 'POR_HACER', fechaLimite: '2026-10-21' }),
        ],
      },
      { today: TODAY, general: parseDays('5, 2', [7, 1]), fatal: parseDays('30;10', [15]) },
    );
    expect(items.map((i) => i.reminders)).toEqual([
      [30, 10],
      [5, 2],
    ]);
  });

  it('gives each open period of an obligation its own item, a year ahead', () => {
    const d = demoData();
    const items = agendaItems(
      {
        Obligaciones: d.Obligaciones.filter((o) => o.id === ID.obNorte),
        CumplimientosHistorial: d.CumplimientosHistorial,
      },
      { today: TODAY },
    );
    // July and August were validated; September is under review.
    expect(items.map((i) => `${i.periodo} ${i.enRevision ? 'revision' : 'abierto'}`)).toEqual([
      '2026-09-12 revision',
      '2026-10-12 abierto',
      '2026-11-12 abierto',
      '2026-12-12 abierto',
      '2027-01-12 abierto',
      '2027-02-12 abierto',
      '2027-03-12 abierto',
      '2027-04-12 abierto',
      '2027-05-12 abierto',
      '2027-06-12 abierto',
      '2027-07-12 abierto',
      '2027-08-12 abierto',
      '2027-09-12 abierto',
    ]);
    expect(items[1]?.key).toBe(`Obligaciones:${ID.obNorte}:2026-10-12`);
  });

  it('moves a period that falls on a non-working day when the obligation says so', () => {
    const items = agendaItems(
      {
        Obligaciones: [
          row(1, {
            nombre: 'Aviso ficticio',
            estado: 'ACTIVA',
            proximoVencimiento: '2026-10-10',
            recorreSiInhabil: true,
          }),
        ],
      },
      { today: TODAY, inhabiles: new Set(['2026-10-12']) },
    );
    // Saturday the 10th, Sunday, and Monday the 12th is a holiday: Tuesday.
    expect(items.map((i) => `${i.periodo}>${i.date}`)).toEqual(['2026-10-10>2026-10-13']);
  });

  it('gives an open filing an item per date, and a closed one none', () => {
    const items = agendaItems(
      {
        Tramites: [
          row(1, {
            titulo: 'Licencia',
            estado: 'EN_TRAMITE',
            fechaLimite: '2026-11-30',
            proximaActuacion: '2026-10-15',
          }),
          row(2, { titulo: 'Cerrado', estado: 'CONCLUIDO', fechaLimite: '2026-11-30' }),
        ],
      },
      { today: TODAY },
    );
    expect(summary(items)).toEqual([
      '2026-10-15 Tramites:#:proximaActuacion VENCIMIENTO proximaActuacion [7,1]',
      '2026-11-30 Tramites:#:fechaLimite VENCIMIENTO fechaLimite [7,1]',
    ]);
  });

  it('gives a contract its last day to give notice and the end of its term', () => {
    const items = agendaItems(
      {
        Contratos: [
          row(1, {
            contraparte: 'Distribuidora Ficticia',
            vigenciaHasta: '2027-01-31',
            diasAvisoPrevio: 30,
          }),
          row(2, { contraparte: 'Sin fechas' }),
        ],
      },
      { today: TODAY },
    );
    expect(summary(items)).toEqual([
      '2027-01-01 Contratos:#:aviso VENCIMIENTO aviso [7,1]',
      '2027-01-31 Contratos:#:vencimiento VENCIMIENTO vencimiento [7,1]',
    ]);
    expect(items[0]?.titulo).toBe('Distribuidora Ficticia');
  });

  it('places appointments on their day in Cancún; they can be moved from Calendar', () => {
    const items = agendaItems(
      {
        Eventos: [
          // 21:30 in Cancún is already the next day in UTC.
          row(1, {
            titulo: 'Junta',
            tipo: 'REUNION',
            inicio: '2026-10-07T21:30:00.000-05:00',
            fin: '2026-10-07T22:30:00.000-05:00',
          }),
          row(2, {
            titulo: 'Audiencia',
            tipo: 'AUDIENCIA',
            inicio: '2026-10-09T10:00:00.000-05:00',
          }),
          row(3, {
            titulo: 'Inventario',
            tipo: 'CITA',
            inicio: '2026-10-05T00:00:00.000-05:00',
            todoElDia: true,
          }),
          row(4, {
            titulo: 'Plazo a mano',
            tipo: 'VENCIMIENTO',
            inicio: '2026-10-06T00:00:00.000-05:00',
            todoElDia: true,
          }),
        ],
      },
      { today: TODAY },
    );
    expect(
      items.map(
        (i) =>
          `${i.date} ${i.titulo} ${i.start ?? '-'} ${i.end ?? '-'} ${i.movable ? 'movible' : 'fijo'} [${i.reminders.join(',')}]`,
      ),
    ).toEqual([
      '2026-10-05 Inventario - - movible [1]',
      '2026-10-06 Plazo a mano - - fijo [7,1]',
      '2026-10-07 Junta 2026-10-08T02:30:00.000Z 2026-10-08T03:30:00.000Z movible [1]',
      // Without an end, an hour.
      '2026-10-09 Audiencia 2026-10-09T15:00:00.000Z 2026-10-09T16:00:00.000Z movible [7,1]',
    ]);
  });

  it('keeps to its window: 90 days back and a year ahead by default', () => {
    const items = agendaItems(
      {
        Tareas: [
          row(1, { titulo: 'Vieja', estado: 'POR_HACER', fechaLimite: '2026-06-01' }),
          row(2, { titulo: 'Vencida', estado: 'POR_HACER', fechaLimite: '2026-09-01' }),
          row(3, { titulo: 'Lejana', estado: 'POR_HACER', fechaLimite: '2027-12-01' }),
        ],
      },
      { today: TODAY },
    );
    expect(items.map((i) => `${i.titulo} ${String(daysUntil(i, TODAY))}`)).toEqual(['Vencida -33']);
  });

  it('carries what the reader needs to filter and open it', () => {
    const [item] = agendaItems(
      {
        Tareas: [
          row(1, {
            titulo: 'Interna',
            estado: 'POR_HACER',
            fechaLimite: '2026-10-08',
            visibilidad: 'INTERNO',
            entidadId: uid(0x7901),
            responsableId: uid(0x7902),
          }),
        ],
      },
      { today: TODAY },
    );
    expect(item).toMatchObject({
      table: 'Tareas',
      id: uid(0x7801),
      clienteId: CLIENT,
      entidadId: uid(0x7901),
      visibilidad: 'INTERNO',
      responsableId: uid(0x7902),
    });
  });
});

describe('reminder days from the settings', () => {
  it('reads a list, largest first, without repeats', () => {
    expect(parseDays('1,7,7', [3])).toEqual([7, 1]);
    expect(parseDays(' 15; 3 1 ', [3])).toEqual([15, 3, 1]);
  });

  it('falls back when the value says nothing usable', () => {
    expect(parseDays('', [7, 1])).toEqual([7, 1]);
    expect(parseDays('nunca, -2, 1.5', [7, 1])).toEqual([7, 1]);
    expect(parseDays(null, [1])).toEqual([1]);
  });
});
