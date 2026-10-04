/**
 * Phase 3: a matter's progress (`Asuntos.avance`) is kept by the server
 * from its tasks. It counts the internal ones too, so it stays with the
 * firm: a client's screen counts the tasks the client sees.
 */
import { ID, uid } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { Device, op } from './testing/device.ts';
import { createWorld } from './testing/harness.ts';

describe('a matter’s progress', () => {
  it('follows its tasks: done, new, moved, deleted', () => {
    const w = createWorld();
    const firm = new Device(w, ID.abogado);
    const avance = (): unknown => w.row('Asuntos', ID.asNorte)?.avance ?? null;

    // Three tasks (one internal), none done.
    firm.push([op('Tareas', 'update', ID.tDespacho, { estado: 'HECHO' })]);
    expect(avance()).toBe(33);

    const extra = uid(0xb01);
    firm.push([
      op('Tareas', 'create', extra, {
        clienteId: ID.clienteA,
        asuntoId: ID.asNorte,
        entidadId: ID.norte,
        titulo: 'Tarea nueva',
        ladoResponsable: 'EMPIRICA',
        estado: 'HECHO',
        visibilidad: 'COMPARTIDO',
      }),
    ]);
    expect(avance()).toBe(50);

    // Moved to another matter: both are counted again.
    firm.push([
      op(
        'Tareas',
        'update',
        extra,
        { asuntoId: ID.asSur, entidadId: ID.sur },
        {
          at: '2026-10-02T12:00:00.000-05:00',
        },
      ),
    ]);
    expect(avance()).toBe(33);
    expect(w.row('Asuntos', ID.asSur)?.avance).toBe(50);

    firm.push([op('Tareas', 'delete', extra, undefined, { at: '2026-10-02T12:00:01.000-05:00' })]);
    expect(w.row('Asuntos', ID.asSur)?.avance).toBe(0);
    expect(
      w.rows('Bitacora').some((b) => b.accion === 'SISTEMA' && b.entidadId === ID.asNorte),
    ).toBe(true);
  });

  it('reaches the firm, never a client', () => {
    const w = createWorld();
    new Device(w, ID.abogado).push([op('Tareas', 'update', ID.tDespacho, { estado: 'HECHO' })]);
    expect(new Device(w, ID.abogado).sync().get('Asuntos', ID.asNorte)).toMatchObject({
      avance: 33,
    });
    for (const as of [ID.cAdmin, ID.cColab]) {
      const asunto = new Device(w, as).sync().get('Asuntos', ID.asNorte);
      expect(asunto).toBeDefined();
      expect(asunto).not.toHaveProperty('avance');
    }
  });

  it('is counted once per push, however many of its tasks changed', () => {
    const w = createWorld();
    const before = w.rows('Bitacora').length;
    new Device(w, ID.abogado).push(
      [ID.tNorte1, ID.tInterna, ID.tDespacho].map((id, i) =>
        op(
          'Tareas',
          'update',
          id,
          { estado: 'HECHO' },
          {
            at: `2026-10-02T12:00:0${String(i)}.000-05:00`,
          },
        ),
      ),
    );
    expect(w.row('Asuntos', ID.asNorte)?.avance).toBe(100);
    const progress = w
      .rows('Bitacora')
      .slice(before)
      .filter((b) => b.accion === 'SISTEMA' && b.entidadId === ID.asNorte);
    expect(progress).toHaveLength(1);
  });
});
