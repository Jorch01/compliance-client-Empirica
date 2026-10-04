import { ID, demoData } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import type { Row } from '@empirica/shared';
import type { Me } from '../session/context.ts';
import { can, roleIn } from './access.ts';
import { groupTasks, isOpenRequest, relativeDay, worstOf } from './dashboard.ts';
import {
  daysBetween,
  onClientSide,
  taskSemaforo,
  todayInCancun,
  upcoming,
  urgencyOf,
} from './deadlines.ts';
import { inScope, rootUnit, unitTree, unitsUnder } from './scope.ts';

const task = (fields: Record<string, unknown>): Row => ({
  id: `t-${JSON.stringify(fields)}`,
  ...fields,
});

describe('dates in Cancún', () => {
  it('today is the date in UTC-5, all year', () => {
    // 03:00 UTC on Oct 4 is still Oct 3 in Cancún.
    expect(todayInCancun(Date.parse('2026-10-04T03:00:00Z'))).toBe('2026-10-03');
    expect(todayInCancun(Date.parse('2026-10-04T05:00:00Z'))).toBe('2026-10-04');
  });

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-10-03', '2026-10-15')).toBe(12);
    expect(daysBetween('2026-10-03', '2026-10-01')).toBe(-2);
  });

  it('overdue, due within a week, on time, or no date', () => {
    expect(urgencyOf('2026-10-02', '2026-10-03')).toBe('overdue');
    expect(urgencyOf('2026-10-03', '2026-10-03')).toBe('dueSoon');
    expect(urgencyOf('2026-10-10', '2026-10-03')).toBe('dueSoon');
    expect(urgencyOf('2026-10-11', '2026-10-03')).toBe('onTime');
    expect(urgencyOf(null, '2026-10-03')).toBe('none');
  });
});

describe('the traffic light of tasks', () => {
  const today = '2026-10-03';

  it('done and in review win over the date', () => {
    expect(taskSemaforo(task({ estado: 'HECHO', fechaLimite: '2026-01-01' }), today)).toBe('done');
    expect(taskSemaforo(task({ estado: 'EN_REVISION', fechaLimite: '2026-01-01' }), today)).toBe(
      'review',
    );
    expect(taskSemaforo(task({ estado: 'POR_HACER' }), today)).toBe('noDate');
  });

  it('the client side ends when the client sends it for review (D18)', () => {
    expect(onClientSide(task({ ladoResponsable: 'CLIENTE', estado: 'EN_CURSO' }))).toBe(true);
    expect(onClientSide(task({ ladoResponsable: 'AMBOS', estado: 'BLOQUEADA' }))).toBe(true);
    expect(onClientSide(task({ ladoResponsable: 'CLIENTE', estado: 'EN_REVISION' }))).toBe(false);
    expect(onClientSide(task({ ladoResponsable: 'EMPIRICA', estado: 'POR_HACER' }))).toBe(false);
  });

  it('groups tasks for the tiles, soonest first, and the worst number sets the light', () => {
    const groups = groupTasks(
      [
        task({ estado: 'POR_HACER', fechaLimite: '2026-10-01', ladoResponsable: 'EMPIRICA' }),
        task({ estado: 'POR_HACER', fechaLimite: '2026-09-01', ladoResponsable: 'CLIENTE' }),
        task({ estado: 'EN_CURSO', fechaLimite: '2026-10-05', ladoResponsable: 'CLIENTE' }),
        task({ estado: 'EN_REVISION', ladoResponsable: 'CLIENTE' }),
        task({ estado: 'HECHO', fechaLimite: '2026-01-01', ladoResponsable: 'CLIENTE' }),
      ],
      today,
    );
    expect(groups.overdue.map((t) => t.fechaLimite)).toEqual(['2026-09-01', '2026-10-01']);
    expect(groups.dueSoon).toHaveLength(1);
    expect(groups.inReview).toHaveLength(1);
    expect(groups.clientSide).toHaveLength(2);
    expect(worstOf(groups)).toBe('overdue');
    expect(worstOf({ overdue: [], dueSoon: [], inReview: groups.inReview })).toBe('review');
    expect(worstOf({ overdue: [], dueSoon: [], inReview: [] })).toBe('onTime');
  });

  it('says how far a date is in words', () => {
    expect(relativeDay('2026-10-03', today)).toEqual({ key: 'today', count: 0 });
    expect(relativeDay('2026-10-04', today)).toEqual({ key: 'tomorrow', count: 1 });
    expect(relativeDay('2026-10-13', today)).toEqual({ key: 'inDays', count: 10 });
    expect(relativeDay('2026-09-30', today)).toEqual({ key: 'daysAgo', count: 3 });
  });

  it('a request is open until it is turned down or becomes a matter', () => {
    expect(isOpenRequest(task({ estado: 'RECIBIDA' }))).toBe(true);
    expect(isOpenRequest(task({ estado: 'RECHAZADA' }))).toBe(false);
    expect(isOpenRequest(task({ estado: 'CONVERTIDA' }))).toBe(false);
  });

  it('lists what is dated within the window, overdue included, closed left out', () => {
    const list = upcoming(
      [
        {
          table: 'Tareas',
          rows: [
            task({ titulo: 'A', fechaLimite: '2026-10-20', estado: 'POR_HACER' }),
            task({ titulo: 'B', fechaLimite: '2026-09-20', estado: 'POR_HACER' }),
            task({ titulo: 'C', fechaLimite: '2026-10-05', estado: 'HECHO' }),
            task({ titulo: 'D', fechaLimite: '2026-12-20', estado: 'POR_HACER' }),
          ],
          field: 'fechaLimite',
          label: 'titulo',
        },
        {
          table: 'Obligaciones',
          rows: [task({ nombre: 'E', proximoVencimiento: '2026-10-10', estado: 'INACTIVA' })],
          field: 'proximoVencimiento',
          label: 'nombre',
        },
      ],
      today,
      30,
    );
    expect(list.map((d) => d.label)).toEqual(['B', 'A']);
  });
});

describe('client and unit', () => {
  const data = demoData();
  const unitsOfA = data.Entidades.filter((e) => e.clienteId === ID.clienteA);

  it('a unit includes its branches', () => {
    expect([...(unitsUnder(ID.norte, unitsOfA) ?? [])].sort()).toEqual(
      [ID.norte, ID.norte1].sort(),
    );
    expect(unitsUnder(null, unitsOfA)).toBeNull();
    expect(rootUnit(ID.norte1, unitsOfA)).toBe(ID.norte);
  });

  it('shows units as a tree: each unit, then its branches', () => {
    expect(unitTree(unitsOfA).map((n) => [n.row.nombre, n.depth])).toEqual([
      ['Unidad Norte', 0],
      ['Sucursal Norte 1', 1],
      ['Unidad Sur', 0],
    ]);
  });

  it('narrows records to the chosen client and unit', () => {
    const units = unitsUnder(ID.norte, unitsOfA);
    const scope = { clientId: ID.clienteA, unitId: ID.norte };
    const byId = (id: string): Row => {
      const row = data.Tareas.find((t) => t.id === id);
      if (!row) throw new Error(`no task ${id}`);
      return row;
    };
    expect(inScope('Tareas', byId(ID.tNorte1), scope, units)).toBe(true);
    expect(inScope('Tareas', byId(ID.tSurAsignada), scope, units)).toBe(false);
    expect(inScope('Tareas', byId(ID.tB), { clientId: ID.clienteA, unitId: null }, null)).toBe(
      false,
    );
    expect(inScope('Tareas', byId(ID.tB), { clientId: null, unitId: null }, null)).toBe(true);
  });
});

describe('what the interface offers', () => {
  const me = (fields: Partial<Me>): Me => ({
    id: 'u',
    name: 'Demo',
    email: 'demo@example.test',
    lado: 'CLIENTE',
    rolBase: 'CLIENTE_COLABORADOR',
    isAdmin: false,
    isFirm: false,
    clients: [],
    config: {},
    ...fields,
  });
  const member = (rol: Me['clients'][number]['rol']): Me['clients'][number] => ({
    id: ID.clienteA,
    razonSocial: 'Cliente Demo, S.A. de C.V.',
    nombreComercial: null,
    rol,
    alcance: null,
  });

  it('the partner may do everything, everywhere', () => {
    const socia = me({ lado: 'EMPIRICA', rolBase: 'SOCIO_ADMIN', isAdmin: true, isFirm: true });
    expect(roleIn(socia, ID.clienteB)).toBe('SOCIO_ADMIN');
    expect(can(socia, 'Clientes', 'create', null)).toBe(true);
  });

  it('a lawyer works only the clients assigned to them', () => {
    const abogado = me({
      lado: 'EMPIRICA',
      rolBase: 'ABOGADO',
      isFirm: true,
      clients: [{ ...member('ABOGADO') }],
    });
    expect(can(abogado, 'Tareas', 'update', ID.clienteA)).toBe(true);
    expect(roleIn(abogado, ID.clienteB)).toBeNull();
  });

  it('a client collaborator may move tasks but not create them; read-only may not', () => {
    const colab = me({ clients: [member('CLIENTE_COLABORADOR')] });
    expect(can(colab, 'Tareas', 'update', ID.clienteA)).toBe(true);
    expect(can(colab, 'Tareas', 'create', ID.clienteA)).toBe(false);
    expect(can(colab, 'Solicitudes', 'create', ID.clienteA)).toBe(true);
    const lectura = me({ rolBase: 'CLIENTE_LECTURA', clients: [member('CLIENTE_LECTURA')] });
    expect(can(lectura, 'Tareas', 'update', ID.clienteA)).toBe(false);
    expect(can(lectura, 'Solicitudes', 'create', ID.clienteA)).toBe(false);
  });
});
