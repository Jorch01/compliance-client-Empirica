/**
 * Phase 3: a conflict on a legally sensitive field waits for a lawyer, who
 * keeps the value that stayed or applies the proposal (PLAN.md § 5).
 */
import type { ApiFailure, ConflictResolveData } from '@empirica/shared';
import { ID } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { Device, op } from './testing/device.ts';
import { createWorld } from './testing/harness.ts';

/** The lawyer moved a deadline; the assistant, offline, moved it elsewhere. */
function withConflict() {
  const w = createWorld();
  const lawyer = new Device(w, ID.abogado);
  const assistant = new Device(w, ID.asistente);
  const base = { fechaLimite: '2026-10-15' };
  lawyer.push([op('Tareas', 'update', ID.tNorte1, { fechaLimite: '2026-10-20' }, { base })]);
  assistant.push([op('Tareas', 'update', ID.tNorte1, { fechaLimite: '2026-10-18' }, { base })]);
  const conflict = w
    .rows('Conflictos')
    .find((c) => c.entidadId === ID.tNorte1 && c.propuestoPor === ID.asistente);
  if (!conflict) throw new Error('no conflict');
  return { w, lawyer, conflictoId: conflict.id };
}

const failure = (res: unknown): ApiFailure['error'] => {
  const r = res as ApiFailure;
  expect(r.ok).toBe(false);
  return r.error;
};

describe('deciding a conflict', () => {
  it('applying the proposal changes the record, logs it and closes the conflict', () => {
    const { w, conflictoId } = withConflict();
    const data = w.ok<ConflictResolveData>(
      'conflicts.resolve',
      { conflictoId, decision: 'APLICAR' },
      { as: ID.abogado },
    );
    expect(data.conflicto).toMatchObject({
      estado: 'RESUELTO',
      resueltoPor: ID.abogado,
      decision: 'APLICAR',
    });
    expect(data.record).toMatchObject({ id: ID.tNorte1, fechaLimite: '2026-10-18' });
    expect(w.row('Tareas', ID.tNorte1)?.fechaLimite).toBe('2026-10-18');
    expect(
      w
        .rows('Bitacora')
        .filter((b) => b.accion === 'RESOLVER')
        .map((b) => b.entidad),
    ).toEqual(expect.arrayContaining(['Tareas', 'Conflictos']));
    // Whoever was told about it has nothing left to do.
    const notices = w
      .rows('Notificaciones')
      .filter((n) => n.tipo === 'CONFLICTO' && n.link === `#/conflictos/${conflictoId}`);
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.every((n) => n.leida === true)).toBe(true);
  });

  it('keeping the value that stayed leaves the record as it was', () => {
    const { w, conflictoId } = withConflict();
    const before = w.row('Tareas', ID.tNorte1);
    const data = w.ok<ConflictResolveData>(
      'conflicts.resolve',
      { conflictoId, decision: 'CONSERVAR' },
      { as: ID.socio },
    );
    expect(data.conflicto).toMatchObject({ estado: 'RESUELTO', decision: 'CONSERVAR' });
    expect(w.row('Tareas', ID.tNorte1)).toEqual(before);
  });

  it('is decided once', () => {
    const { w, conflictoId } = withConflict();
    w.ok('conflicts.resolve', { conflictoId, decision: 'CONSERVAR' }, { as: ID.abogado });
    expect(
      failure(w.call('conflicts.resolve', { conflictoId, decision: 'APLICAR' }, { as: ID.socio })),
    ).toMatchObject({ code: 'CONFLICT', details: { reason: 'ALREADY_RESOLVED' } });
    expect(w.row('Tareas', ID.tNorte1)?.fechaLimite).toBe('2026-10-20');
  });

  it('only the SOCIO_ADMIN or a lawyer of that client decides', () => {
    const { w, conflictoId } = withConflict();
    const attempt = (as: string) =>
      failure(w.call('conflicts.resolve', { conflictoId, decision: 'APLICAR' }, { as }));
    // The assistant sees it, but does not decide it.
    expect(attempt(ID.asistente)).toMatchObject({ code: 'FORBIDDEN' });
    // A lawyer of another client, or a client user: as if it did not exist.
    expect(attempt(ID.abogadoB)).toMatchObject({ code: 'NOT_FOUND' });
    expect(attempt(ID.cAdmin)).toMatchObject({ code: 'NOT_FOUND' });
    expect(attempt(ID.cB)).toMatchObject({ code: 'NOT_FOUND' });
    expect(w.row('Conflictos', conflictoId)?.estado).toBe('PENDIENTE');
  });

  it('a device sees the decision with its next sync', () => {
    const { w, lawyer, conflictoId } = withConflict();
    lawyer.sync();
    w.ok('conflicts.resolve', { conflictoId, decision: 'APLICAR' }, { as: ID.socio });
    lawyer.sync();
    expect(lawyer.get('Conflictos', conflictoId)).toMatchObject({ estado: 'RESUELTO' });
    expect(lawyer.get('Tareas', ID.tNorte1)).toMatchObject({ fechaLimite: '2026-10-18' });
  });

  it('cannot apply to a record deleted meanwhile', () => {
    const { w, lawyer, conflictoId } = withConflict();
    lawyer.push([
      op('Tareas', 'delete', ID.tNorte1, undefined, { at: '2026-10-02T12:00:00.000-05:00' }),
    ]);
    expect(
      failure(
        w.call('conflicts.resolve', { conflictoId, decision: 'APLICAR' }, { as: ID.abogado }),
      ),
    ).toMatchObject({ code: 'CONFLICT', details: { reason: 'RECORD_DELETED' } });
  });

  it('an unknown or malformed id is not found', () => {
    const w = createWorld();
    expect(
      failure(
        w.call(
          'conflicts.resolve',
          { conflictoId: '00000000-0000-4000-8000-00000000dead', decision: 'APLICAR' },
          { as: ID.socio },
        ),
      ),
    ).toMatchObject({ code: 'NOT_FOUND' });
    expect(
      failure(
        w.call('conflicts.resolve', { conflictoId: 'x', decision: 'APLICAR' }, { as: ID.socio }),
      ),
    ).toMatchObject({ code: 'VALIDATION' });
  });
});
