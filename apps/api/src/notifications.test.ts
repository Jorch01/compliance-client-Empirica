/**
 * The bell (F5): who hears what when changes arrive by sync, and what the
 * server never does: tell people about their own action, about a record they
 * may not see, about a client they no longer have, or while inactive.
 */
import { text } from '@empirica/shared';
import { ID, uid } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { underLock } from './actions/locked.ts';
import { saveNotifications } from './notify.ts';
import { Device, op } from './testing/device.ts';
import { createWorld, type World } from './testing/harness.ts';

const notes = (w: World, tipo?: string) =>
  w
    .rows('Notificaciones')
    .filter((n) => n.id !== ID.notifColab && n.id !== ID.notifB && (!tipo || n.tipo === tipo))
    .map((n) => [n.usuarioId, n.tipo, n.mensaje, n.link]);

describe('the bell', () => {
  it('tells whoever a task is given to, never whoever gave it', () => {
    const w = createWorld();
    new Device(w, ID.abogado).push([
      op('Tareas', 'update', ID.tNorte1, { responsableId: ID.cColab }),
      op('Tareas', 'update', ID.tDespacho, { responsableId: ID.abogado }),
    ]);
    expect(notes(w)).toEqual([
      [ID.cColab, 'TAREA_ASIGNADA', 'Entregar acta constitutiva', `/tareas/${ID.tNorte1}`],
    ]);
    // Only that person's devices receive it.
    const id = w.rows('Notificaciones').find((n) => n.tipo === 'TAREA_ASIGNADA')?.id ?? '';
    expect(new Device(w, ID.cColab).sync().has('Notificaciones', id)).toBe(true);
    expect(new Device(w, ID.cAdmin).sync().has('Notificaciones', id)).toBe(false);
    expect(new Device(w, ID.socio).sync().has('Notificaciones', id)).toBe(false);
  });

  it('tells the firm when a client sends a task to review', () => {
    const w = createWorld();
    new Device(w, ID.cColab).push([op('Tareas', 'update', ID.tNorte1, { estado: 'EN_REVISION' })]);
    expect(notes(w, 'TAREA_EN_REVISION')).toEqual([
      [ID.abogado, 'TAREA_EN_REVISION', 'Entregar acta constitutiva', `/tareas/${ID.tNorte1}`],
    ]);
  });

  it('follows evidence: sent to the lawyer, the answer to whoever sent it', () => {
    const w = createWorld();
    const record = uid(0xc201);
    new Device(w, ID.cColab).push([
      op('CumplimientosHistorial', 'create', record, {
        obligacionId: ID.obNorte,
        periodo: '2026-10-12',
        fechaCumplimiento: '2026-10-02',
        notas: 'Enviado',
      }),
    ]);
    const link = `/compliance/${ID.obNorte}`;
    const obligacion = w.row('Obligaciones', ID.obNorte);
    const name = obligacion ? (text(obligacion, 'nombre') ?? '') : '';
    expect(notes(w)).toEqual([[ID.abogado, 'EVIDENCIA_ENVIADA', name, link]]);
    new Device(w, ID.abogado).push([
      op(
        'CumplimientosHistorial',
        'update',
        record,
        { estado: 'RECHAZADO', validadoPor: ID.abogado, notas: 'Ilegible' },
        { baseVersion: 1 },
      ),
    ]);
    expect(notes(w, 'EVIDENCIA_RECHAZADA')).toEqual([
      [ID.cColab, 'EVIDENCIA_RECHAZADA', name, link],
    ]);
  });

  it('tells the lawyer about a request, and the author about an answer to their suggestion', () => {
    const w = createWorld();
    new Device(w, ID.cAdmin).push([
      op('Solicitudes', 'create', uid(0xc301), {
        clienteId: ID.clienteA,
        titulo: 'Revisar arrendamiento',
      }),
    ]);
    expect(notes(w, 'SOLICITUD_NUEVA')).toEqual([
      [ID.abogado, 'SOLICITUD_NUEVA', 'Revisar arrendamiento', `/solicitudes/${uid(0xc301)}`],
    ]);
    new Device(w, ID.socio).push([
      op('Sugerencias', 'update', ID.sugColab, {
        estado: 'RESUELTA',
        respuesta: 'Listo, ya está.',
      }),
    ]);
    expect(notes(w, 'SUGERENCIA_RESPONDIDA')).toEqual([
      [
        ID.cColab,
        'SUGERENCIA_RESPONDIDA',
        'Sería útil ver los pendientes por fecha.',
        '/sugerencias',
      ],
    ]);
  });

  it('never tells the actor, the inactive, nor anyone about what they may not see', () => {
    const w = createWorld();
    const internal = w.row('Tareas', ID.tInterna);
    const shared = w.row('Tareas', ID.tNorte1);
    if (!internal || !shared) throw new Error('fixtures');
    const draft = (usuarioId: string, row = shared, clienteId: string = ID.clienteA) => ({
      usuarioId,
      tipo: 'TAREA_ASIGNADA' as const,
      about: { table: 'Tareas' as const, row },
      mensaje: text(row, 'titulo') ?? '',
      link: `/tareas/${row.id}`,
      clienteId,
    });
    const saved = underLock(w.env, ID.abogado, (r) =>
      saveNotifications(
        r.db,
        r.writer,
        [
          draft(ID.abogado), // the actor
          draft(ID.cInactivo), // not active
          draft(ID.cColab, internal), // internal: the client never sees it
          draft(ID.cB), // another client's person
          draft(ID.cAdminSur), // outside their units
          draft(ID.cColab), // this one, and only this one
          draft(ID.cColab), // the same twice is one
        ],
        ID.abogado,
      ),
    );
    expect(saved).toBe(1);
    expect(notes(w)).toEqual([
      [ID.cColab, 'TAREA_ASIGNADA', 'Entregar acta constitutiva', `/tareas/${ID.tNorte1}`],
    ]);
  });
});
