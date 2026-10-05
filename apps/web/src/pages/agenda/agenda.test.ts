import type { AgendaItem } from '@empirica/shared';
import { describe, expect, it } from 'vitest';
import { feedUrl, googleSubscribeUrl, groupAgenda, webcalUrl } from './agenda.ts';

const TODAY = '2026-10-05';

function item(over: Partial<AgendaItem> & Pick<AgendaItem, 'key' | 'date'>): AgendaItem {
  return {
    table: 'Tareas',
    id: over.key,
    clienteId: 'c1',
    entidadId: null,
    visibilidad: 'COMPARTIDO',
    tipo: 'VENCIMIENTO',
    fatal: false,
    detalle: null,
    titulo: over.key,
    start: null,
    end: null,
    reminders: [],
    movable: false,
    enRevision: false,
    responsableId: null,
    periodo: null,
    ...over,
  };
}

const items = [
  item({ key: 'late', date: '2026-10-01' }),
  item({ key: 'late-in-review', date: '2026-10-02', enRevision: true }),
  item({ key: 'past-meeting', date: '2026-10-03', table: 'Eventos', tipo: 'REUNION' }),
  item({ key: 'due-today', date: TODAY }),
  item({ key: 'hearing-today', date: TODAY, table: 'Eventos', tipo: 'AUDIENCIA' }),
  item({ key: 'next-week', date: '2026-10-12', fatal: true }),
];

const keys = (list: readonly AgendaItem[]): string[] => list.map((i) => i.key);

describe('the agenda page', () => {
  it('lists overdue deadlines first, then each day from today on', () => {
    const { overdue, days } = groupAgenda(items, TODAY, 'all');
    // In review: the firm has it; a past appointment is history.
    expect(keys(overdue)).toEqual(['late']);
    expect(days.map((d) => d.date)).toEqual([TODAY, '2026-10-12']);
    expect(keys(days[0]?.items ?? [])).toEqual(['due-today', 'hearing-today']);
  });

  it('filters deadlines and appointments', () => {
    const deadlines = groupAgenda(items, TODAY, 'deadlines');
    expect(keys(deadlines.overdue)).toEqual(['late']);
    expect(deadlines.days.flatMap((d) => keys(d.items))).toEqual(['due-today', 'next-week']);
    const appointments = groupAgenda(items, TODAY, 'appointments');
    expect(appointments.overdue).toEqual([]);
    expect(appointments.days.flatMap((d) => keys(d.items))).toEqual(['hearing-today']);
  });

  it('builds the personal feed address and the ways to subscribe to it', () => {
    const url = feedUrl('a'.repeat(64));
    expect(url).toMatch(/^https?:\/\//);
    expect(url).toMatch(new RegExp(`[?&]action=ics&token=${'a'.repeat(64)}$`));
    expect(webcalUrl('https://script.google.com/macros/s/X/exec?action=ics&token=t')).toBe(
      'webcal://script.google.com/macros/s/X/exec?action=ics&token=t',
    );
    expect(googleSubscribeUrl('https://example.test/exec?action=ics&token=t')).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent('webcal://example.test/exec?action=ics&token=t')}`,
    );
  });
});
