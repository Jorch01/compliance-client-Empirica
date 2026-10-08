/**
 * "Crear con IA" on the device (F8): who sees it, and creating a reviewed
 * proposal in order, linked, as the AI's (the Bitacora's CREAR_IA).
 */
import type { ClientSummary, DraftItem, Rol, Row, TableName, Value } from '@empirica/shared';
import { describe, expect, it } from 'vitest';
import type { Me } from '../../session/context.ts';
import { createDraft, eventFields, eventParts, itemTitle, mayDraft } from './draft.ts';

const A = '00000000-0000-4000-8000-00000000001a';
const B = '00000000-0000-4000-8000-00000000001b';

const client = (id: string, rol: Rol, ia = true): ClientSummary => ({
  id,
  razonSocial: 'Cliente Demo, S.A. de C.V.',
  nombreComercial: null,
  rol,
  alcance: null,
  ia,
});

const me = (rolBase: Rol, clients: ClientSummary[]): Me => ({
  id: 'me',
  name: 'Persona Demo',
  email: 'persona@despacho.example',
  lado: rolBase.startsWith('CLIENTE') ? 'CLIENTE' : 'EMPIRICA',
  rolBase,
  isAdmin: rolBase === 'SOCIO_ADMIN',
  isFirm: !rolBase.startsWith('CLIENTE'),
  clients,
  config: {},
});

describe('who creates with the AI (D73)', () => {
  it('the SOCIO_ADMIN and the client’s ABOGADO, where the AI is on', () => {
    expect(mayDraft(me('SOCIO_ADMIN', [client(A, 'SOCIO_ADMIN')]), A)).toBe(true);
    expect(mayDraft(me('ABOGADO', [client(A, 'ABOGADO')]), A)).toBe(true);
    // Not for a client the lawyer is not on, nor where the AI is off.
    expect(mayDraft(me('ABOGADO', [client(A, 'ABOGADO')]), B)).toBe(false);
    expect(mayDraft(me('ABOGADO', [client(A, 'ABOGADO', false)]), A)).toBe(false);
    expect(mayDraft(me('ASISTENTE', [client(A, 'ASISTENTE')]), A)).toBe(false);
    for (const rol of ['CLIENTE_ADMIN', 'CLIENTE_COLABORADOR', 'CLIENTE_LECTURA'] as const) {
      expect(mayDraft(me(rol, [client(A, rol)]), A)).toBe(false);
    }
    expect(mayDraft(me('ABOGADO', [client(A, 'ABOGADO')]), null)).toBe(false);
  });
});

describe('creating a reviewed proposal', () => {
  const item = (
    key: string,
    table: DraftItem['table'],
    fields: Record<string, Value>,
    links: DraftItem['links'] = {},
  ): DraftItem => ({ key, table, fields: { clienteId: A, ...fields }, links, review: [] });

  it('in order, linked, a filing in its template’s first stage, every record marked as the AI’s', async () => {
    const calls: { table: TableName; id: string; fields: Record<string, Value>; via?: string }[] =
      [];
    const engine = {
      mutate: (
        table: TableName,
        _type: string,
        id: string,
        fields: Record<string, Value> = {},
        options: { via?: 'IA' } = {},
      ): Promise<Row | undefined> => {
        calls.push({ table, id, fields, ...(options.via ? { via: options.via } : {}) });
        return Promise.resolve(undefined);
      },
    };
    const template: Row = { id: 'tpl', nombre: 'Licencia', etapas: [] };
    let n = 0;
    const records = await createDraft(
      engine,
      [
        item('E3', 'Tramites', { titulo: 'Licencia', plantillaId: 'tpl' }, { asuntoId: 'E1' }),
        item('E2', 'Tareas', { titulo: 'Revisar' }, { asuntoId: 'E1' }),
        item('E1', 'Asuntos', { titulo: 'Revisión' }),
      ],
      {
        templates: new Map([
          ['tpl', { row: template, stages: [{ nombre: 'Integración', dias: 10 }] }],
        ]),
        today: '2026-10-08',
        newId: () => `id-${String(++n)}`,
      },
    );
    expect(records.map((r) => r.key)).toEqual(['E1', 'E2', 'E3']);
    expect(calls.map((c) => [c.table, c.id, c.via])).toEqual([
      ['Asuntos', 'id-1', 'IA'],
      ['Tareas', 'id-2', 'IA'],
      ['Tramites', 'id-3', 'IA'],
    ]);
    expect(calls[1]?.fields).toMatchObject({ asuntoId: 'id-1' });
    expect(calls[2]?.fields).toMatchObject({
      asuntoId: 'id-1',
      etapaActual: 'Integración',
      historialEtapas: [{ etapa: 'Integración', fecha: '2026-10-08' }],
    });
  });

  it('names an item by its title, an obligation’s name or a contract’s counterparty', () => {
    expect(itemTitle({ fields: { titulo: ' Revisión ' } })).toBe('Revisión');
    expect(itemTitle({ fields: { nombre: 'Aviso anual' } })).toBe('Aviso anual');
    expect(itemTitle({ fields: { contraparte: 'Proveedor' } })).toBe('Proveedor');
    expect(itemTitle({ fields: {} })).toBe('');
  });

  it('an appointment’s day and times, back and forth, in the firm’s offset', () => {
    const fields = eventFields({ day: '2026-10-12', start: '10:00', end: '11:30', allDay: false });
    expect(fields).toEqual({
      inicio: '2026-10-12T10:00:00.000-05:00',
      fin: '2026-10-12T11:30:00.000-05:00',
      todoElDia: false,
    });
    expect(eventParts(fields)).toEqual({
      day: '2026-10-12',
      start: '10:00',
      end: '11:30',
      allDay: false,
    });
    expect(eventFields({ day: '2026-10-12', start: '10:00', end: '11:00', allDay: true })).toEqual({
      inicio: '2026-10-12T00:00:00.000-05:00',
      fin: null,
      todoElDia: true,
    });
    expect(eventFields({ day: '', start: '10:00', end: '11:00', allDay: false })).toMatchObject({
      inicio: null,
    });
  });
});
