/**
 * The permission matrix (docs/PERMISOS.md), checked cell by cell, plus the
 * mandatory isolation and visibility rules.
 */
import { describe, expect, it } from 'vitest';
import type { Rol } from '../domain/enums.ts';
import { PULLED_TABLES, TABLES, type TableName } from '../domain/tables.ts';
import type { Row, Value } from '../domain/values.ts';
import { ID, demoData, uid, type Dataset } from '../testing/fixtures.ts';
import { buildUserContext, userHasClientAccess, type UserContext } from './context.ts';
import { authorizeConflictResolution, authorizeDownload, authorizeUpload } from './online.ts';
import { canRead, projectRow } from './read.ts';
import { buildSnapshot } from './snapshot.ts';
import { authorizeWrite, onlyToggled, type OpType, type WriteLookup } from './write.ts';

const A = ID.clienteA;

function world(mutate?: (d: Dataset) => void) {
  const data = demoData();
  mutate?.(data);
  const find = (table: TableName, id: string): Row | undefined =>
    data[table].find((r) => r.id === id);
  const lookup: WriteLookup = {
    get: find,
    userCanAccess: (userId, clienteId) =>
      userHasClientAccess(data.Usuarios, data.Membresias, userId, clienteId),
  };
  const ctx = (userId: string): UserContext => {
    const user = find('Usuarios', userId);
    if (!user) throw new Error(`no user ${userId}`);
    return buildUserContext({
      user,
      membresias: data.Membresias,
      entidades: data.Entidades,
      clientes: data.Clientes,
    });
  };
  const row = (table: TableName, id: string): Row => {
    const r = find(table, id);
    if (!r) throw new Error(`no ${table} ${id}`);
    return r;
  };
  const sees = (userId: string, table: TableName, id: string): boolean =>
    canRead(ctx(userId), table, row(table, id), lookup);
  const write = (
    userId: string,
    table: TableName,
    type: OpType,
    id: string,
    fields: Record<string, Value> = {},
  ) => authorizeWrite(ctx(userId), { table, type, id, current: find(table, id), fields }, lookup);
  return { data, lookup, ctx, row, sees, write };
}

const CLIENT_USERS_OF_A = [ID.cAdmin, ID.cColab, ID.cLectura, ID.cAdminSur];
const FIRM_OF_A = [ID.socio, ID.abogado, ID.asistente];

describe('user context', () => {
  const w = world();

  it('gives the SOCIO_ADMIN every client', () => {
    const c = w.ctx(ID.socio);
    expect(c.isAdmin).toBe(true);
    expect([...c.clients.keys()].sort()).toEqual([A, ID.clienteB].sort());
  });

  it('gives lawyers and assistants only the clients they are assigned to', () => {
    expect([...w.ctx(ID.abogado).clients.keys()]).toEqual([A]);
    expect(w.ctx(ID.asistente).clients.get(A)?.rol).toBe('ASISTENTE');
    expect([...w.ctx(ID.abogadoB).clients.keys()]).toEqual([ID.clienteB]);
  });

  it('expands a unit scope to its branches', () => {
    const access = w.ctx(ID.cColab).clients.get(A);
    expect(access?.rol).toBe('CLIENTE_COLABORADOR');
    expect([...(access?.units ?? [])].sort()).toEqual([ID.norte, ID.norte1].sort());
  });

  it('gives hub users the whole client', () => {
    expect(w.ctx(ID.cAdmin).clients.get(A)?.units).toBeNull();
  });

  it('ignores memberships that do not match the user side or are not active', () => {
    const v = world((d) => {
      d.Membresias.push(
        {
          ...d.Membresias[0],
          id: uid(0x9001),
          usuarioId: ID.cB,
          clienteId: A,
          rol: 'ABOGADO',
        },
        {
          ...d.Membresias[0],
          id: uid(0x9002),
          usuarioId: ID.abogadoB,
          clienteId: A,
          estado: 'REVOCADA',
        },
      );
    });
    expect(v.ctx(ID.cB).clients.has(A)).toBe(false);
    expect(v.ctx(ID.abogadoB).clients.has(A)).toBe(false);
  });

  it('treats an unreadable scope as an empty one, never as the hub', () => {
    const v = world((d) => {
      const m = d.Membresias.find((x) => x.usuarioId === ID.cColab);
      if (m) m.alcance = 'not json';
    });
    const access = v.ctx(ID.cColab).clients.get(A);
    expect(access?.units?.size).toBe(0);
    expect(v.sees(ID.cColab, 'Asuntos', ID.asNorte)).toBe(false);
  });

  it('keeps the narrower of two memberships in the same client', () => {
    const v = world((d) => {
      d.Membresias.push({
        ...d.Membresias[0],
        id: uid(0x9003),
        usuarioId: ID.cAdmin,
        clienteId: A,
        rol: 'CLIENTE_LECTURA',
        alcance: { entidades: [ID.sur], asuntos: [] },
        estado: 'ACTIVA',
      });
    });
    const access = v.ctx(ID.cAdmin).clients.get(A);
    expect(access?.rol).toBe('CLIENTE_LECTURA');
    expect([...(access?.units ?? [])]).toEqual([ID.sur]);
  });
});

describe('isolation between clients', () => {
  const w = world();
  const rowsOf = (clienteId: string) =>
    PULLED_TABLES.flatMap((t) =>
      w.data[t]
        .filter((r) => {
          const col = TABLES[t].scope.client;
          return col !== undefined && (col === 'id' ? r.id : r[col]) === clienteId;
        })
        .map((r) => [t, r] as const),
    );

  it.each([ID.cB, ID.abogadoB])('user %s sees nothing of client A', (userId) => {
    const c = w.ctx(userId);
    const leaks = rowsOf(A).filter(([t, r]) => canRead(c, t, r, w.lookup));
    expect(leaks).toEqual([]);
  });

  it.each([...CLIENT_USERS_OF_A, ID.abogado, ID.asistente])(
    'user %s sees nothing of client B',
    (userId) => {
      const c = w.ctx(userId);
      const leaks = rowsOf(ID.clienteB).filter(([t, r]) => canRead(c, t, r, w.lookup));
      expect(leaks).toEqual([]);
    },
  );

  it('notifications reach only their recipient', () => {
    expect(w.sees(ID.cColab, 'Notificaciones', ID.notifColab)).toBe(true);
    expect(w.sees(ID.cAdmin, 'Notificaciones', ID.notifColab)).toBe(false);
    expect(w.sees(ID.socio, 'Notificaciones', ID.notifColab)).toBe(false);
  });
});

describe('INTERNO never reaches a client user', () => {
  const w = world();

  it.each(CLIENT_USERS_OF_A)('user %s receives no internal record of client A', (userId) => {
    const c = w.ctx(userId);
    const leaks = PULLED_TABLES.flatMap((t) =>
      w.data[t].filter((r) => r.visibilidad === 'INTERNO' && canRead(c, t, r, w.lookup)),
    );
    expect(leaks).toEqual([]);
  });

  it.each(CLIENT_USERS_OF_A)(
    'user %s does not see shared records inside an internal matter',
    (userId) => {
      expect(w.sees(userId, 'Tareas', ID.tBajoInterno)).toBe(false);
      expect(w.sees(userId, 'Comentarios', ID.cmEnInterno)).toBe(false);
    },
  );

  it.each(FIRM_OF_A)('firm user %s sees internal records of its client', (userId) => {
    expect(w.sees(userId, 'Asuntos', ID.asInterno)).toBe(true);
    expect(w.sees(userId, 'Tareas', ID.tInterna)).toBe(true);
    expect(w.sees(userId, 'Comentarios', ID.cmInterno)).toBe(true);
    expect(w.sees(userId, 'Obligaciones', ID.obInterna)).toBe(true);
  });

  it('conflict notices are for the firm only', () => {
    expect(w.sees(ID.abogado, 'Conflictos', ID.conflictoA)).toBe(true);
    expect(w.sees(ID.asistente, 'Conflictos', ID.conflictoA)).toBe(true);
    expect(w.sees(ID.cAdmin, 'Conflictos', ID.conflictoA)).toBe(false);
    expect(w.sees(ID.abogadoB, 'Conflictos', ID.conflictoA)).toBe(false);
  });
});

describe('unit scope (hub and units)', () => {
  const w = world();

  it('a unit user sees its unit and branches, and nothing else of the client', () => {
    const sees = (t: TableName, id: string) => w.sees(ID.cColab, t, id);
    expect(sees('Entidades', ID.norte)).toBe(true);
    expect(sees('Entidades', ID.norte1)).toBe(true);
    expect(sees('Entidades', ID.sur)).toBe(false);
    expect(sees('Asuntos', ID.asNorte)).toBe(true);
    expect(sees('Tareas', ID.tNorte1)).toBe(true);
    expect(sees('Asuntos', ID.asHub)).toBe(false);
    expect(sees('Asuntos', ID.asSur)).toBe(false);
    expect(sees('Solicitudes', ID.solSur)).toBe(false);
    expect(sees('Clientes', A)).toBe(true);
  });

  it('a unit user sees what is assigned to it or what it created, wherever it is', () => {
    expect(w.sees(ID.cColab, 'Tareas', ID.tSurAsignada)).toBe(true);
    expect(w.sees(ID.cColab, 'Solicitudes', ID.solNorte)).toBe(true);
  });

  it('attached records follow the record they belong to', () => {
    expect(w.sees(ID.cColab, 'Comentarios', ID.cmCompartido)).toBe(true);
    expect(w.sees(ID.cColab, 'Documentos', ID.docNorte)).toBe(true);
    expect(w.sees(ID.cColab, 'CumplimientosHistorial', ID.cuNorte)).toBe(true);
    expect(w.sees(ID.cColab, 'Eventos', ID.evNorte)).toBe(true);
    expect(w.sees(ID.cAdminSur, 'Comentarios', ID.cmCompartido)).toBe(false);
    expect(w.sees(ID.cAdminSur, 'Eventos', ID.evNorte)).toBe(false);
  });

  it('hub users see every unit', () => {
    for (const id of [ID.asHub, ID.asNorte, ID.asSur]) {
      expect(w.sees(ID.cAdmin, 'Asuntos', id)).toBe(true);
      expect(w.sees(ID.cLectura, 'Asuntos', id)).toBe(true);
    }
  });
});

describe('what each user receives of a record', () => {
  const w = world();

  it('client users never get internal columns or sync bookkeeping', () => {
    const c = w.ctx(ID.cAdmin);
    const cliente = projectRow(c, 'Clientes', w.row('Clientes', A));
    for (const k of [
      'driveFolderId',
      'calendarId',
      'modoIA',
      'membershipEpoch',
      'alcanceHist',
      'seqAlta',
    ]) {
      expect(cliente).not.toHaveProperty(k);
    }
    expect(cliente.razonSocial).toBe('Cliente Demo, S.A. de C.V.');
    expect(projectRow(c, 'Documentos', w.row('Documentos', ID.docNorte))).not.toHaveProperty(
      'driveFileId',
    );
  });

  it('the firm gets operational columns but never server-only ones', () => {
    const cliente = projectRow(w.ctx(ID.abogado), 'Clientes', w.row('Clientes', A));
    expect(cliente.driveFolderId).toBe('drive-folder-a');
    expect(cliente).not.toHaveProperty('membershipEpoch');
    expect(cliente).not.toHaveProperty('alcanceHist');
  });
});

describe('users, memberships and settings', () => {
  const w = world();
  const snap = (userId: string) =>
    buildSnapshot(w.ctx(userId), {
      usuarios: w.data.Usuarios,
      membresias: w.data.Membresias,
      entidades: w.data.Entidades,
      config: w.data.Config,
    });
  const ids = (rows: Row[]) => rows.map((r) => r.id).sort();

  it('a unit user sees its team, the hub and its own unit, not other units', () => {
    const s = snap(ID.cColab);
    expect(ids(s.Usuarios)).toEqual(
      [ID.socio, ID.abogado, ID.asistente, ID.cAdmin, ID.cColab, ID.cLectura].sort(),
    );
    const other = s.Usuarios.find((u) => u.id === ID.abogado);
    expect(Object.keys(other ?? {}).sort()).toEqual(['email', 'id', 'lado', 'nombre', 'rolBase']);
    expect(ids(s.Membresias)).toEqual(
      w.data.Membresias.filter((m) => m.usuarioId === ID.cColab).map((m) => m.id),
    );
  });

  it('a client user sees nobody of another client', () => {
    const s = snap(ID.cB);
    expect(ids(s.Usuarios)).toEqual([ID.socio, ID.abogadoB, ID.cB].sort());
  });

  it('a hub admin sees the memberships of the company; a unit admin, only inside its units', () => {
    expect(snap(ID.cAdmin).Membresias.every((m) => m.clienteId === A)).toBe(true);
    expect(snap(ID.cAdmin).Membresias.length).toBe(
      w.data.Membresias.filter((m) => m.clienteId === A).length,
    );
    expect(ids(snap(ID.cAdminSur).Membresias)).toEqual(
      w.data.Membresias.filter((m) => m.usuarioId === ID.cAdminSur).map((m) => m.id),
    );
  });

  it('nobody receives server-only user columns, not even about themselves', () => {
    const v = world((d) => {
      for (const u of d.Usuarios) {
        u.icsToken = 'hash';
        u.firebaseUid = 'uid';
      }
    });
    for (const userId of [ID.socio, ID.cColab]) {
      const s = buildSnapshot(v.ctx(userId), {
        usuarios: v.data.Usuarios,
        membresias: v.data.Membresias,
        entidades: v.data.Entidades,
        config: v.data.Config,
      });
      for (const u of s.Usuarios) {
        expect(u).not.toHaveProperty('icsToken');
        expect(u).not.toHaveProperty('firebaseUid');
      }
    }
  });

  it('settings: public ones for everybody, all of them for the SOCIO_ADMIN', () => {
    expect(ids(snap(ID.cLectura).Config)).toEqual([ID.cfgPublica]);
    expect(ids(snap(ID.abogado).Config)).toEqual([ID.cfgPublica]);
    expect(ids(snap(ID.socio).Config)).toEqual([ID.cfgPublica, ID.cfgPrivada].sort());
  });
});

/**
 * The matrix, one cell per role and operation. C, U and D are the operations
 * the role may perform on a representative record of the tab (PERMISOS.md).
 */
const ROLE_USERS: [Rol, string][] = [
  ['SOCIO_ADMIN', ID.socio],
  ['ABOGADO', ID.abogado],
  ['ASISTENTE', ID.asistente],
  ['CLIENTE_ADMIN', ID.cAdmin],
  ['CLIENTE_COLABORADOR', ID.cColab],
  ['CLIENTE_LECTURA', ID.cLectura],
];

interface Cell {
  target: string;
  update: Record<string, Value>;
  create: Record<string, Value>;
  /** Allowed operations for SA, AB, AS, CA, CC, CL. */
  expected: [string, string, string, string, string, string];
}

const MATRIX: Partial<Record<TableName, Cell>> = {
  Clientes: {
    target: A,
    update: { idioma: 'en' },
    create: {
      razonSocial: 'Cliente Nuevo, S.A. de C.V.',
      servicio: 'ASUNTO_PUNTUAL',
      estado: 'ACTIVO',
    },
    expected: ['CUD', 'U', 'U', '', '', ''],
  },
  Entidades: {
    target: ID.norte,
    update: { nombre: 'Unidad Norte Centro' },
    create: { clienteId: A, nombre: 'Unidad Nueva', tipo: 'UNIDAD', parentId: ID.norte },
    expected: ['CUD', 'CUD', 'CU', '', '', ''],
  },
  Asuntos: {
    target: ID.asNorte,
    update: { titulo: 'Licencia renovada' },
    create: {
      clienteId: A,
      entidadId: ID.norte,
      titulo: 'Nuevo',
      area: 'LABORAL',
      estado: 'ACTIVO',
      visibilidad: 'COMPARTIDO',
    },
    expected: ['CUD', 'CUD', 'CU', '', '', ''],
  },
  Tareas: {
    target: ID.tNorte1,
    update: { estado: 'EN_REVISION' },
    create: {
      clienteId: A,
      asuntoId: ID.asNorte,
      entidadId: ID.norte,
      titulo: 'Nueva',
      ladoResponsable: 'EMPIRICA',
      estado: 'POR_HACER',
      visibilidad: 'COMPARTIDO',
    },
    expected: ['CUD', 'CUD', 'CU', 'U', 'U', ''],
  },
  Tramites: {
    target: ID.trNorte,
    update: { folioExpediente: 'EXP-001/2026' },
    create: {
      clienteId: A,
      entidadId: ID.norte,
      estado: 'EN_PREPARACION',
      visibilidad: 'COMPARTIDO',
    },
    expected: ['CUD', 'CUD', 'CU', '', '', ''],
  },
  PlantillasTramite: {
    target: ID.plantilla,
    update: { autoridad: 'Otra' },
    create: { nombre: 'BORRADOR: validar' },
    expected: ['CUD', '', '', '', '', ''],
  },
  Obligaciones: {
    target: ID.obNorte,
    update: { evidenciaRequerida: 'Acuse' },
    create: {
      clienteId: A,
      entidadId: ID.norte,
      categoria: 'OTRO',
      nombre: 'BORRADOR: validar',
      estado: 'ACTIVA',
      visibilidad: 'COMPARTIDO',
    },
    expected: ['CUD', 'CUD', 'CU', '', '', ''],
  },
  CumplimientosHistorial: {
    target: ID.cuNorte,
    update: { notas: 'Revisado' },
    create: { obligacionId: ID.obNorte, periodo: '2026-10', estado: 'EN_REVISION' },
    expected: ['CUD', 'CU', 'CU', 'C', 'C', ''],
  },
  CatalogoObligaciones: {
    target: ID.catalogo,
    update: { autoridad: 'Otra' },
    create: { categoria: 'OTRO', nombre: 'BORRADOR: validar' },
    expected: ['CUD', '', '', '', '', ''],
  },
  Contratos: {
    target: ID.ctNorte,
    update: { tipo: 'Suministro' },
    create: {
      clienteId: A,
      entidadId: ID.norte,
      contraparte: 'Otra Empresa Ficticia',
      visibilidad: 'COMPARTIDO',
    },
    expected: ['CUD', 'CUD', 'CU', '', '', ''],
  },
  Documentos: {
    target: ID.docNorte,
    update: { nombre: 'acta-firmada.pdf' },
    create: {
      vinculo: { tipo: 'Asuntos', id: ID.asNorte },
      nombre: 'evidencia.pdf',
      visibilidad: 'COMPARTIDO',
    },
    expected: ['CUD', 'CUD', 'CU', 'C', 'C', ''],
  },
  Solicitudes: {
    target: ID.solNorte,
    update: { titulo: 'Revisar contrato del proveedor' },
    create: { clienteId: A, entidadId: ID.norte, titulo: 'Nueva solicitud', estado: 'RECIBIDA' },
    expected: ['CUD', 'CU', 'CU', 'C', 'C', ''],
  },
  Comentarios: {
    // Written by the lawyer: the lawyer edits and deletes it as its author.
    target: ID.cmCompartido,
    update: { texto: 'Ya presentamos la solicitud (editado).' },
    create: {
      tipoEntidad: 'Asuntos',
      entidadId: ID.asNorte,
      texto: 'Gracias',
      visibilidad: 'COMPARTIDO',
    },
    expected: ['CUD', 'CUD', 'C', 'C', 'C', ''],
  },
  Eventos: {
    target: ID.evNorte,
    update: { titulo: 'Visita reprogramada' },
    create: {
      clienteId: A,
      entidadId: ID.norte,
      titulo: 'Audiencia',
      inicio: '2026-10-21T10:00:00.000-05:00',
      tipo: 'AUDIENCIA',
      visibilidad: 'COMPARTIDO',
    },
    expected: ['CUD', 'CUD', 'CU', '', '', ''],
  },
  DiasInhabiles: {
    target: ID.inhabil,
    update: { descripcion: 'BORRADOR: validar (editado)' },
    create: { fecha: '2026-12-25', descripcion: 'BORRADOR: validar' },
    expected: ['CUD', '', '', '', '', ''],
  },
  Sugerencias: {
    // Sent by the unit collaborator: only the administrators answer it.
    target: ID.sugColab,
    update: { estado: 'EN_REVISION' },
    create: { tipo: 'SUGERENCIA', mensaje: 'Una idea para el portal' },
    expected: ['CU', 'C', 'C', 'C', 'C', 'C'],
  },
};

describe('the matrix, cell by cell', () => {
  for (const [table, cell] of Object.entries(MATRIX) as [TableName, Cell][]) {
    describe(table, () => {
      ROLE_USERS.forEach(([rol, userId], i) => {
        const allowed = cell.expected[i] ?? '';
        it(`${rol}: ${allowed || 'read only or nothing'}`, () => {
          const w = world();
          const create = w.write(userId, table, 'create', uid(0x7777), cell.create);
          const update = w.write(userId, table, 'update', cell.target, cell.update);
          const remove = w.write(userId, table, 'delete', cell.target);
          // A denial is a permission answer, never a validation error that
          // would hide a missing rule.
          const outcome = (d: typeof create): string =>
            d.ok ? 'allowed' : d.code === 'VALIDATION' ? `invalid ${d.reason}` : 'denied';
          const expected = (op: string): string => (allowed.includes(op) ? 'allowed' : 'denied');
          expect({ C: outcome(create), U: outcome(update), D: outcome(remove) }).toEqual({
            C: expected('C'),
            U: expected('U'),
            D: expected('D'),
          });
        });
      });
    });
  }

  it.each([
    'Config',
    'Usuarios',
    'Membresias',
    'Invitaciones',
    'Conflictos',
    'Bitacora',
    'Reportes',
    'OpsAplicadas',
  ] as TableName[])('%s cannot be written through sync, not even by the SOCIO_ADMIN', (table) => {
    const w = world();
    expect(w.write(ID.socio, table, 'create', uid(0x8888), {})).toMatchObject({
      ok: false,
      reason: 'READ_ONLY_TABLE',
    });
  });
});

describe('feedback about the portal (Sugerencias)', () => {
  const w = world();

  it('whoever sends it sees it; the administrators see all; nobody else does', () => {
    expect(w.sees(ID.cColab, 'Sugerencias', ID.sugColab)).toBe(true);
    expect(w.sees(ID.socio, 'Sugerencias', ID.sugColab)).toBe(true);
    expect(w.sees(ID.socio, 'Sugerencias', ID.sugB)).toBe(true);
    for (const other of [ID.abogado, ID.asistente, ID.cAdmin, ID.cLectura, ID.cB]) {
      expect(w.sees(other, 'Sugerencias', ID.sugColab)).toBe(false);
    }
    expect(w.sees(ID.cColab, 'Sugerencias', ID.sugB)).toBe(false);
  });

  it('even read-only users can send one, always as themselves and as new', () => {
    const own = w.write(ID.cLectura, 'Sugerencias', 'create', uid(0x9901), {
      tipo: 'ERROR',
      mensaje: 'No abre la pantalla de equipo',
    });
    expect(own).toMatchObject({
      ok: true,
      fields: { usuarioId: ID.cLectura, estado: 'NUEVA' },
    });
    expect(
      w.write(ID.cLectura, 'Sugerencias', 'create', uid(0x9902), {
        tipo: 'ERROR',
        mensaje: 'Firmado por otro',
        usuarioId: ID.cAdmin,
      }),
    ).toMatchObject({ ok: false, reason: 'FORCED_VALUE', field: 'usuarioId' });
    expect(
      w.write(ID.cLectura, 'Sugerencias', 'create', uid(0x9903), {
        tipo: 'SUGERENCIA',
        mensaje: 'Ya resuelta por mí',
        estado: 'RESUELTA',
      }),
    ).toMatchObject({ ok: false, reason: 'FORCED_VALUE', field: 'estado' });
    expect(
      w.write(ID.cLectura, 'Sugerencias', 'create', uid(0x9904), {
        tipo: 'SUGERENCIA',
        mensaje: 'Con respuesta propia',
        respuesta: 'Listo',
      }),
    ).toMatchObject({ ok: false, reason: 'FIELD_NOT_ALLOWED', field: 'respuesta' });
  });

  it('the administrators answer and move it, but never rewrite what was sent', () => {
    expect(
      w.write(ID.socio, 'Sugerencias', 'update', ID.sugColab, {
        estado: 'RESUELTA',
        respuesta: 'Listo: ya se ordenan por fecha.',
      }),
    ).toMatchObject({ ok: true });
    expect(
      w.write(ID.socio, 'Sugerencias', 'update', ID.sugColab, { mensaje: 'Otro texto' }),
    ).toMatchObject({ ok: false, reason: 'IMMUTABLE', field: 'mensaje' });
    expect(
      w.write(ID.cColab, 'Sugerencias', 'update', ID.sugColab, { estado: 'RESUELTA' }),
    ).toMatchObject({ ok: false, reason: 'ROLE' });
  });

  it('it carries no client: it never depends on access to one', () => {
    expect(TABLES.Sugerencias.scope.client).toBeUndefined();
    expect(PULLED_TABLES).toContain('Sugerencias');
  });
});

describe('online actions: conflicts and files', () => {
  /** A conflict about a task of client A, still to decide. */
  const conflictOf = (w: ReturnType<typeof world>): Row => {
    const c = w.data.Conflictos.find((x) => x.entidadId === ID.tNorte1);
    if (!c) throw new Error('no conflict in the demo data');
    return c;
  };

  it('a conflict is decided by the SOCIO_ADMIN or a lawyer of its client', () => {
    const w = world();
    const decide = (userId: string) =>
      authorizeConflictResolution(w.ctx(userId), conflictOf(w), w.lookup);
    expect(decide(ID.socio)).toEqual({ ok: true, clienteId: A });
    expect(decide(ID.abogado)).toEqual({ ok: true, clienteId: A });
    expect(decide(ID.asistente)).toMatchObject({ ok: false, code: 'FORBIDDEN', reason: 'ROLE' });
    for (const u of [ID.abogadoB, ID.cB, ...CLIENT_USERS_OF_A]) {
      expect(decide(u)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    }
    expect(authorizeConflictResolution(w.ctx(ID.socio), undefined, w.lookup)).toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('a conflict is decided once, and never on a deleted record', () => {
    const resolved = world((d) => {
      const c = d.Conflictos.find((x) => x.entidadId === ID.tNorte1);
      if (c) c.estado = 'RESUELTO';
    });
    expect(
      authorizeConflictResolution(resolved.ctx(ID.socio), conflictOf(resolved), resolved.lookup),
    ).toMatchObject({ code: 'CONFLICT', reason: 'ALREADY_RESOLVED' });
    const gone = world((d) => {
      const t = d.Tareas.find((x) => x.id === ID.tNorte1);
      if (t) t.deleted = '2026-10-01T10:00:00.000-05:00';
    });
    expect(
      authorizeConflictResolution(gone.ctx(ID.socio), conflictOf(gone), gone.lookup),
    ).toMatchObject({ code: 'CONFLICT', reason: 'RECORD_DELETED' });
  });

  /** A document of the Norte unit, created by `subidoPor`, with or without its file. */
  const withDocument = (subidoPor: string, driveFileId: string | null) =>
    world((d) => {
      const doc = d.Documentos.find((x) => x.id === ID.docNorte);
      if (doc) Object.assign(doc, { subidoPor, driveFileId });
    });

  it('the firm sends a document’s file at any time (a new version)', () => {
    const w = withDocument(ID.abogado, 'drive-file-1');
    const doc = w.row('Documentos', ID.docNorte);
    expect(authorizeUpload(w.ctx(ID.abogado), doc, w.lookup)).toEqual({ ok: true, clienteId: A });
    expect(authorizeUpload(w.ctx(ID.asistente), doc, w.lookup)).toMatchObject({ ok: true });
    expect(authorizeUpload(w.ctx(ID.abogadoB), doc, w.lookup)).toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('a client user sends only the first file of their own document', () => {
    const fresh = withDocument(ID.cColab, null);
    const doc = fresh.row('Documentos', ID.docNorte);
    expect(authorizeUpload(fresh.ctx(ID.cColab), doc, fresh.lookup)).toMatchObject({ ok: true });
    expect(authorizeUpload(fresh.ctx(ID.cAdmin), doc, fresh.lookup)).toMatchObject({
      code: 'FORBIDDEN',
      reason: 'NOT_OWNER',
    });
    expect(authorizeUpload(fresh.ctx(ID.cLectura), doc, fresh.lookup)).toMatchObject({
      code: 'FORBIDDEN',
      reason: 'ROLE',
    });
    const sent = withDocument(ID.cColab, 'drive-file-1');
    expect(
      authorizeUpload(sent.ctx(ID.cColab), sent.row('Documentos', ID.docNorte), sent.lookup),
    ).toMatchObject({ code: 'CONFLICT', reason: 'ALREADY_UPLOADED' });
  });

  it('a file is downloaded by whoever sees its document, once it has one', () => {
    const w = withDocument(ID.abogado, 'drive-file-1');
    const doc = w.row('Documentos', ID.docNorte);
    for (const u of [ID.socio, ID.abogado, ID.asistente, ID.cAdmin, ID.cColab, ID.cLectura]) {
      expect(authorizeDownload(w.ctx(u), doc, w.lookup)).toMatchObject({ ok: true });
    }
    for (const u of [ID.cAdminSur, ID.cB, ID.abogadoB]) {
      expect(authorizeDownload(w.ctx(u), doc, w.lookup)).toMatchObject({ code: 'NOT_FOUND' });
    }
    const internal = world((d) => {
      const x = d.Documentos.find((r) => r.id === ID.docNorte);
      if (x) x.visibilidad = 'INTERNO';
    });
    expect(
      authorizeDownload(
        internal.ctx(ID.cAdmin),
        internal.row('Documentos', ID.docNorte),
        internal.lookup,
      ),
    ).toMatchObject({ code: 'NOT_FOUND' });
    const empty = withDocument(ID.abogado, null);
    expect(
      authorizeDownload(empty.ctx(ID.abogado), empty.row('Documentos', ID.docNorte), empty.lookup),
    ).toMatchObject({ code: 'NOT_FOUND', reason: 'NOT_UPLOADED' });
  });
});

describe('rules inside the cells', () => {
  it('a client user moves its tasks to review but never closes them (D18)', () => {
    const w = world();
    expect(w.write(ID.cColab, 'Tareas', 'update', ID.tNorte1, { estado: 'HECHO' })).toMatchObject({
      ok: false,
      reason: 'TASK_STATE',
    });
    expect(w.write(ID.cColab, 'Tareas', 'update', ID.tNorte1, { titulo: 'x' })).toMatchObject({
      ok: false,
      reason: 'FIELD_NOT_ALLOWED',
      field: 'titulo',
    });
    expect(
      w.write(ID.cColab, 'Tareas', 'update', ID.tDespacho, { estado: 'EN_CURSO' }),
    ).toMatchObject({
      ok: false,
      reason: 'TASK_NOT_CLIENT_SIDE',
    });
    const closed = world((d) => {
      const t = d.Tareas.find((x) => x.id === ID.tNorte1);
      if (t) t.estado = 'HECHO';
    });
    expect(
      closed.write(ID.cColab, 'Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' }),
    ).toMatchObject({
      ok: false,
      reason: 'TASK_CLOSED',
    });
  });

  it('a client user ticks checklist items but cannot rewrite them', () => {
    const w = world();
    const checklist = w.row('Tareas', ID.tNorte1).checklist as {
      id: string;
      texto: string;
      hecho: boolean;
    }[];
    const ticked = checklist.map((c, i) => ({ ...c, hecho: i === 0 }));
    expect(w.write(ID.cColab, 'Tareas', 'update', ID.tNorte1, { checklist: ticked }).ok).toBe(true);
    const rewritten = checklist.map((c) => ({ ...c, texto: 'otra cosa' }));
    expect(
      w.write(ID.cColab, 'Tareas', 'update', ID.tNorte1, { checklist: rewritten }),
    ).toMatchObject({
      ok: false,
      reason: 'CHECKLIST_EDIT',
    });
    expect(onlyToggled(checklist, [...checklist, { id: 'c3', texto: 'nuevo', hecho: false }])).toBe(
      false,
    );
  });

  it('client comments and documents are always shared; nobody signs as someone else', () => {
    const w = world();
    const comment = { tipoEntidad: 'Asuntos', entidadId: ID.asNorte, texto: 'Hola' };
    expect(
      w.write(ID.cColab, 'Comentarios', 'create', uid(0x7001), {
        ...comment,
        visibilidad: 'INTERNO',
      }),
    ).toMatchObject({
      ok: false,
      reason: 'FORCED_VALUE',
      field: 'visibilidad',
    });
    const ok = w.write(ID.cColab, 'Comentarios', 'create', uid(0x7001), comment);
    expect(ok).toMatchObject({
      ok: true,
      fields: { visibilidad: 'COMPARTIDO', autorId: ID.cColab, clienteId: A, unidadId: ID.norte },
    });
    expect(
      w.write(ID.abogado, 'Comentarios', 'create', uid(0x7002), {
        ...comment,
        autorId: ID.socio,
        visibilidad: 'INTERNO',
      }),
    ).toMatchObject({
      ok: false,
      reason: 'FORCED_VALUE',
      field: 'autorId',
    });
  });

  it('the author of a client comment edits and deletes it; others cannot', () => {
    const w = world();
    expect(
      w.write(ID.cColab, 'Comentarios', 'update', ID.cmCliente, { texto: 'Mañana sin falta.' }).ok,
    ).toBe(true);
    expect(w.write(ID.cColab, 'Comentarios', 'delete', ID.cmCliente).ok).toBe(true);
    expect(w.write(ID.cAdmin, 'Comentarios', 'update', ID.cmCliente, { texto: 'x' })).toMatchObject(
      { reason: 'NOT_OWNER' },
    );
    expect(
      w.write(ID.cColab, 'Comentarios', 'update', ID.cmCliente, { visibilidad: 'INTERNO' }),
    ).toMatchObject({
      reason: 'FIELD_NOT_ALLOWED',
    });
  });

  it('nobody sets the ids of Drive files or calendar events', () => {
    const w = world();
    const doc = {
      vinculo: { tipo: 'Asuntos', id: ID.asNorte },
      nombre: 'x.pdf',
      visibilidad: 'COMPARTIDO',
      driveFileId: 'otro-archivo',
    };
    expect(w.write(ID.cColab, 'Documentos', 'create', uid(0x7003), doc)).toMatchObject({
      reason: 'SERVER_MANAGED',
    });
    expect(w.write(ID.socio, 'Documentos', 'create', uid(0x7003), doc)).toMatchObject({
      reason: 'SERVER_MANAGED',
    });
    expect(
      w.write(ID.socio, 'Documentos', 'update', ID.docNorte, { driveFileId: 'otro' }),
    ).toMatchObject({
      reason: 'SERVER_MANAGED',
    });
  });

  it('evidence from a client stays under review and unvalidated', () => {
    const w = world();
    const evidence = { obligacionId: ID.obNorte, periodo: '2026-10' };
    expect(
      w.write(ID.cColab, 'CumplimientosHistorial', 'create', uid(0x7004), evidence),
    ).toMatchObject({
      ok: true,
      fields: { estado: 'EN_REVISION', clienteId: A, entidadId: ID.norte },
    });
    expect(
      w.write(ID.cColab, 'CumplimientosHistorial', 'create', uid(0x7004), {
        ...evidence,
        estado: 'VALIDADO',
      }),
    ).toMatchObject({
      reason: 'FORCED_VALUE',
    });
    expect(
      w.write(ID.cColab, 'CumplimientosHistorial', 'create', uid(0x7004), {
        ...evidence,
        validadoPor: ID.cColab,
      }),
    ).toMatchObject({
      reason: 'FIELD_NOT_ALLOWED',
    });
  });

  it('a unit user creates only inside its units', () => {
    const w = world();
    const request = { clienteId: A, titulo: 'Alta en el IMSS', estado: 'RECIBIDA' };
    // Another unit is invisible to it: the same answer as an invented id.
    expect(
      w.write(ID.cColab, 'Solicitudes', 'create', uid(0x7005), { ...request, entidadId: ID.sur }),
    ).toMatchObject({
      code: 'NOT_FOUND',
      field: 'entidadId',
    });
    expect(w.write(ID.cColab, 'Solicitudes', 'create', uid(0x7005), request)).toMatchObject({
      reason: 'OUT_OF_SCOPE',
    });
    expect(
      w.write(ID.cColab, 'Solicitudes', 'create', uid(0x7005), { ...request, entidadId: ID.norte1 })
        .ok,
    ).toBe(true);
    expect(w.write(ID.cAdmin, 'Solicitudes', 'create', uid(0x7005), request).ok).toBe(true);
  });

  it('ids of other clients, hidden records and invented ids all answer NOT_FOUND', () => {
    const w = world();
    expect(w.write(ID.cB, 'Asuntos', 'update', ID.asNorte, { titulo: 'x' })).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      w.write(ID.cB, 'Solicitudes', 'create', uid(0x7006), {
        clienteId: A,
        titulo: 'x',
        estado: 'RECIBIDA',
      }),
    ).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      w.write(ID.abogadoB, 'Comentarios', 'create', uid(0x7007), {
        tipoEntidad: 'Asuntos',
        entidadId: ID.asNorte,
        texto: 'x',
        visibilidad: 'INTERNO',
      }),
    ).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      w.write(ID.cAdmin, 'Comentarios', 'create', uid(0x7008), {
        tipoEntidad: 'Asuntos',
        entidadId: ID.asInterno,
        texto: 'x',
      }),
    ).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      w.write(ID.cAdmin, 'Tareas', 'update', ID.tBajoInterno, { estado: 'EN_CURSO' }),
    ).toMatchObject({ code: 'NOT_FOUND' });
    expect(w.write(ID.cColab, 'Asuntos', 'update', uid(0xdead), { titulo: 'x' })).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      w.write(ID.cColab, 'Notificaciones', 'update', ID.notifB, { leida: true }),
    ).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('references must stay inside the client and among its people', () => {
    const w = world();
    const task = {
      clienteId: A,
      titulo: 'x',
      ladoResponsable: 'EMPIRICA',
      estado: 'POR_HACER',
      visibilidad: 'COMPARTIDO',
    };
    expect(
      w.write(ID.abogado, 'Tareas', 'create', uid(0x7009), { ...task, dependeDe: ID.tB }),
    ).toMatchObject({
      code: 'NOT_FOUND',
      field: 'dependeDe',
    });
    expect(
      w.write(ID.abogado, 'Tareas', 'create', uid(0x7009), { ...task, responsableId: ID.cB }),
    ).toMatchObject({
      reason: 'USER_NOT_IN_CLIENT',
    });
    expect(
      w.write(ID.abogado, 'Tareas', 'create', uid(0x7009), {
        ...task,
        responsableId: ID.cInactivo,
      }),
    ).toMatchObject({
      reason: 'USER_NOT_IN_CLIENT',
    });
    expect(
      w.write(ID.abogado, 'Tareas', 'create', uid(0x7009), { ...task, responsableId: ID.socio }).ok,
    ).toBe(true);
    expect(
      w.write(ID.abogado, 'Entidades', 'update', ID.norte, { parentId: ID.norte1 }),
    ).toMatchObject({ reason: 'CYCLE' });
  });

  it('records do not move between clients, and ids are not reused', () => {
    const w = world();
    expect(
      w.write(ID.socio, 'Asuntos', 'update', ID.asNorte, { clienteId: ID.clienteB }),
    ).toMatchObject({
      reason: 'IMMUTABLE',
    });
    expect(
      w.write(ID.socio, 'Asuntos', 'create', ID.asNorte, MATRIX.Asuntos?.create ?? {}),
    ).toMatchObject({
      reason: 'ID_TAKEN',
    });
  });

  it('a notification that names no client is also marked read by its recipient', () => {
    const w = world((d) => {
      const n = d.Notificaciones.find((x) => x.id === ID.notifColab);
      if (n) n.clienteId = null;
    });
    expect(w.write(ID.cColab, 'Notificaciones', 'update', ID.notifColab, { leida: true }).ok).toBe(
      true,
    );
    expect(w.sees(ID.cColab, 'Notificaciones', ID.notifColab)).toBe(true);
    expect(w.sees(ID.cAdmin, 'Notificaciones', ID.notifColab)).toBe(false);
  });

  it('notifications: their recipient marks them read and nothing else', () => {
    const w = world();
    expect(w.write(ID.cColab, 'Notificaciones', 'update', ID.notifColab, { leida: true }).ok).toBe(
      true,
    );
    expect(
      w.write(ID.cColab, 'Notificaciones', 'update', ID.notifColab, { mensaje: 'x' }),
    ).toMatchObject({
      reason: 'IMMUTABLE',
    });
    expect(w.write(ID.cColab, 'Notificaciones', 'delete', ID.notifColab)).toMatchObject({
      reason: 'ROLE',
    });
  });

  it('unchanged fields are not counted as changes', () => {
    const w = world();
    const titulo = w.row('Tareas', ID.tNorte1).titulo ?? null;
    expect(
      w.write(ID.cColab, 'Tareas', 'update', ID.tNorte1, { titulo, estado: 'EN_CURSO' }),
    ).toMatchObject({
      ok: true,
      fields: { estado: 'EN_CURSO' },
    });
  });
});
