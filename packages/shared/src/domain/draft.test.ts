import { describe, expect, it } from 'vitest';
import { draftIssues, draftOrder, resolveDraft, withoutItem, type DraftItem } from './draft.ts';

const CLIENT = '00000000-0000-4000-8000-00000000001a';

const item = (
  key: string,
  table: DraftItem['table'],
  fields: DraftItem['fields'] = {},
  links: DraftItem['links'] = {},
): DraftItem => ({ key, table, fields: { clienteId: CLIENT, ...fields }, links, review: [] });

const matter = item('E1', 'Asuntos', {
  titulo: 'Revisión de contrato',
  area: 'CONTRATOS',
  estado: 'ACTIVO',
  visibilidad: 'INTERNO',
});
const task = (key: string, links: DraftItem['links'] = {}): DraftItem =>
  item(
    key,
    'Tareas',
    {
      titulo: `Tarea ${key}`,
      ladoResponsable: 'EMPIRICA',
      estado: 'POR_HACER',
      visibilidad: 'INTERNO',
    },
    links,
  );

describe('a proposal of the AI (F8)', () => {
  it('is created matters first, and each task after the one it waits for', () => {
    const items = [
      task('E3', { asuntoId: 'E1', dependeDe: 'E2' }),
      item('E4', 'Eventos', {}, { asuntoId: 'E1' }),
      task('E2', { asuntoId: 'E1' }),
      matter,
    ];
    expect(draftOrder(items).map((i) => i.key)).toEqual(['E1', 'E2', 'E3', 'E4']);
  });

  it('turns its links into the ids of what was created before', () => {
    let n = 0;
    const ids = (): string => `id-${String(++n)}`;
    const records = resolveDraft(
      [
        matter,
        task('E2', { asuntoId: 'E1' }),
        task('E3', { asuntoId: 'E1', dependeDe: 'E2' }),
        item('E4', 'Eventos', { titulo: 'Reunión' }, { asuntoId: 'E1' }),
      ],
      ids,
    );
    expect(records.map((r) => [r.key, r.id])).toEqual([
      ['E1', 'id-1'],
      ['E2', 'id-2'],
      ['E3', 'id-3'],
      ['E4', 'id-4'],
    ]);
    expect(records[1]?.fields).toMatchObject({ asuntoId: 'id-1' });
    expect(records[2]?.fields).toMatchObject({ asuntoId: 'id-1', dependeDe: 'id-2' });
    // An appointment hangs from its matter through `origen`.
    expect(records[3]?.fields).toMatchObject({ origen: { tipo: 'Asuntos', id: 'id-1' } });
    expect(records[3]?.fields).not.toHaveProperty('asuntoId');
  });

  it('drops a link that goes in circles or to an item that is not there', () => {
    let n = 0;
    const records = resolveDraft(
      [
        task('E1', { dependeDe: 'E2' }),
        task('E2', { dependeDe: 'E1' }),
        task('E3', { asuntoId: 'X' }),
      ],
      () => `id-${String(++n)}`,
    );
    const waits = records.filter((r) => r.fields.dependeDe);
    expect(waits).toHaveLength(1);
    expect(records.find((r) => r.key === 'E3')?.fields).not.toHaveProperty('asuntoId');
  });

  it('without a matter, also without its tasks; anything else only loses the link', () => {
    const items = [
      matter,
      task('E2', { asuntoId: 'E1' }),
      task('E3', { dependeDe: 'E2' }),
      item('E4', 'Tramites', {}, { asuntoId: 'E1' }),
    ];
    const left = withoutItem(items, 'E1');
    expect(left.map((i) => i.key)).toEqual(['E3', 'E4']);
    expect(left.find((i) => i.key === 'E3')?.links).toEqual({});
    expect(left.find((i) => i.key === 'E4')?.links).toEqual({});
    // A task alone goes alone.
    expect(withoutItem(items, 'E2').map((i) => i.key)).toEqual(['E1', 'E3', 'E4']);
    expect(withoutItem(items, 'nada')).toHaveLength(4);
  });

  it('says what keeps an item from being created', () => {
    expect(draftIssues(matter)).toEqual([]);
    expect(draftIssues(item('E9', 'Asuntos', { titulo: 'Sin área', estado: 'ACTIVO' }))).toEqual(
      expect.arrayContaining(['area', 'visibilidad']),
    );
    expect(draftIssues(item('E9', 'Asuntos', { ...matter.fields, area: 'COCINA' }))).toEqual([
      'area',
    ]);
    const appointment = item('E9', 'Eventos', {
      titulo: 'Reunión',
      tipo: 'REUNION',
      visibilidad: 'INTERNO',
      todoElDia: false,
      inicio: '2026-10-15T10:00:00.000-05:00',
      fin: '2026-10-15T09:00:00.000-05:00',
    });
    expect(draftIssues(appointment)).toEqual(['fin']);
    expect(
      draftIssues({ ...appointment, fields: { ...appointment.fields, todoElDia: true } }),
    ).toEqual([]);
  });
});
