import { describe, expect, it } from 'vitest';
import { TABLES } from '../domain/tables.ts';
import type { Row } from '../domain/values.ts';
import { applyOp, clampStamp, MAX_CLOCK_LEAD_MS, type ApplyInput } from './apply.ts';

const NOW = '2026-10-02T12:00:00.000-05:00';
const NOW_MS = Date.parse(NOW);

const stored: Row = {
  id: 't1',
  createdAt: '2026-09-01T10:00:00.000Z',
  createdBy: 'u0',
  updatedAt: '2026-09-20T10:00:00.000Z',
  updatedBy: 'u0',
  version: 4,
  deleted: null,
  titulo: 'Entregar acta',
  descripcion: 'Original',
  fechaLimite: '2026-10-15',
  estado: 'POR_HACER',
  fieldTimestamps: {
    titulo: '2026-09-10T10:00:00.000Z',
    fechaLimite: '2026-09-10T10:00:00.000Z',
  },
};

const op = (over: Partial<ApplyInput>): ApplyInput => ({
  def: TABLES.Tareas,
  current: stored,
  type: 'update',
  id: 't1',
  fields: {},
  at: '2026-09-25T10:00:00.000Z',
  userId: 'u1',
  serverNow: NOW,
  ...over,
});

describe('clock lead', () => {
  it('pulls stamps far in the future back to the server time', () => {
    const ahead = new Date(NOW_MS + MAX_CLOCK_LEAD_MS + 60_000).toISOString();
    expect(clampStamp(ahead, NOW_MS, NOW)).toBe(NOW);
  });

  it('keeps stamps within five minutes ahead, and anything in the past', () => {
    const slightly = new Date(NOW_MS + 60_000).toISOString();
    expect(clampStamp(slightly, NOW_MS, NOW)).toBe(slightly);
    expect(clampStamp('2026-01-01T00:00:00.000Z', NOW_MS, NOW)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('replaces unreadable stamps with the server time', () => {
    expect(clampStamp('ayer', NOW_MS, NOW)).toBe(NOW);
    expect(clampStamp(undefined, NOW_MS, NOW)).toBe(NOW);
  });
});

describe('creating', () => {
  it('stamps every given field and starts at version 1', () => {
    const r = applyOp(
      op({ type: 'create', current: undefined, fields: { titulo: 'Nueva', descripcion: null } }),
    );
    expect(r.status).toBe('applied');
    expect(r.row).toMatchObject({
      id: 't1',
      version: 1,
      createdBy: 'u1',
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: NOW,
      titulo: 'Nueva',
      fieldTimestamps: { titulo: '2026-09-25T10:00:00.000Z' },
    });
  });
});

describe('updating ordinary fields', () => {
  it('applies a newer edit and bumps the version', () => {
    const r = applyOp(op({ fields: { titulo: 'Entregar acta certificada' } }));
    expect(r.status).toBe('applied');
    expect(r.row).toMatchObject({
      titulo: 'Entregar acta certificada',
      version: 5,
      updatedBy: 'u1',
    });
    expect(r.applied).toEqual(['titulo']);
  });

  it('keeps a more recent edit made by someone else, and says so', () => {
    const r = applyOp(op({ at: '2026-09-05T10:00:00.000Z', fields: { titulo: 'Viejo' } }));
    expect(r.status).toBe('noop');
    expect(r.superseded).toEqual(['titulo']);
  });

  it('compares an untouched field against the record creation, not its last update', () => {
    // descripcion has no stamp of its own: it counts from createdAt (Sept 1).
    const r = applyOp(op({ at: '2026-09-05T10:00:00.000Z', fields: { descripcion: 'Nueva' } }));
    expect(r.applied).toEqual(['descripcion']);
  });

  it('applies as is when the device started from the current version', () => {
    const r = applyOp(
      op({
        at: '2026-09-05T10:00:00.000Z',
        baseVersion: 4,
        fields: { titulo: 'Visto y cambiado' },
      }),
    );
    expect(r.row?.titulo).toBe('Visto y cambiado');
    // The stamp never goes back, so older offline edits keep losing.
    expect((r.row?.fieldTimestamps as Record<string, string>).titulo).toBe(
      '2026-09-10T10:00:00.000Z',
    );
  });

  it('ignores fields that do not change', () => {
    const r = applyOp(op({ fields: { titulo: 'Entregar acta' } }));
    expect(r.status).toBe('noop');
    expect(r.applied).toEqual([]);
  });
});

describe('sensitive fields (fechaLimite, esFatal, visibilidad…)', () => {
  it('apply when the device started from the current value', () => {
    const r = applyOp(
      op({ fields: { fechaLimite: '2026-10-20' }, base: { fechaLimite: '2026-10-15' } }),
    );
    expect(r.row?.fechaLimite).toBe('2026-10-20');
    expect(r.conflicts).toEqual([]);
  });

  it('do not apply when someone changed them in between: the current value stays', () => {
    const r = applyOp(
      op({
        at: '2026-09-30T10:00:00.000Z',
        fields: { fechaLimite: '2026-10-20', titulo: 'Nuevo título' },
        base: { fechaLimite: '2026-10-01' },
      }),
    );
    expect(r.row?.fechaLimite).toBe('2026-10-15');
    expect(r.row?.titulo).toBe('Nuevo título');
    expect(r.conflicts).toEqual([
      { field: 'fechaLimite', current: '2026-10-15', proposed: '2026-10-20' },
    ]);
  });

  it('never win on time alone: without a base they become a conflict', () => {
    const r = applyOp(
      op({ at: '2026-09-30T10:00:00.000Z', fields: { fechaLimite: '2026-10-20' } }),
    );
    expect(r.status).toBe('noop');
    expect(r.conflicts.map((c) => c.field)).toEqual(['fechaLimite']);
  });
});

describe('deleting and restoring', () => {
  it('a deletion after the last edit applies', () => {
    const r = applyOp(op({ type: 'delete', at: '2026-09-25T10:00:00.000Z' }));
    expect(r).toMatchObject({
      status: 'applied',
      deleted: true,
      row: { deleted: '2026-09-25T10:00:00.000Z', version: 5 },
    });
  });

  it('a deletion older than the last edit is rejected: newer work is never lost', () => {
    const r = applyOp(op({ type: 'delete', at: '2026-09-05T10:00:00.000Z' }));
    expect(r).toMatchObject({ status: 'rejected', reason: 'EDITED_AFTER_DELETION' });
  });

  it('an edit made after the deletion brings the record back', () => {
    const deleted: Row = { ...stored, deleted: '2026-09-20T10:00:00.000Z' };
    const r = applyOp(
      op({ current: deleted, at: '2026-09-21T10:00:00.000Z', fields: { titulo: 'Rescatada' } }),
    );
    expect(r).toMatchObject({
      status: 'applied',
      restored: true,
      row: { deleted: null, titulo: 'Rescatada' },
    });
  });

  it('an edit older than the deletion updates the field but the record stays deleted', () => {
    const deleted: Row = { ...stored, deleted: '2026-09-20T10:00:00.000Z' };
    const r = applyOp(
      op({ current: deleted, at: '2026-09-15T10:00:00.000Z', fields: { titulo: 'Tarde' } }),
    );
    expect(r.row).toMatchObject({ deleted: '2026-09-20T10:00:00.000Z', titulo: 'Tarde' });
    expect(r.restored).toBeUndefined();
  });

  it('a restore leaves a mark so the old deletion cannot win again', () => {
    const deleted: Row = { ...stored, deleted: '2026-09-20T10:00:00.000Z' };
    const r = applyOp(op({ type: 'restore', current: deleted, at: '2026-09-22T10:00:00.000Z' }));
    expect(r.row?.deleted).toBeNull();
    const again = applyOp(
      op({ type: 'delete', current: r.row ?? undefined, at: '2026-09-20T10:00:00.000Z' }),
    );
    expect(again.status).toBe('rejected');
  });

  it('deleting twice or restoring a live record changes nothing', () => {
    expect(
      applyOp(op({ type: 'delete', current: { ...stored, deleted: '2026-09-20T10:00:00.000Z' } }))
        .status,
    ).toBe('noop');
    expect(applyOp(op({ type: 'restore' })).status).toBe('noop');
  });
});
