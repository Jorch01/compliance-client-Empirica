/**
 * Ported from TSJ Filing, test_sync_conflictos.js, cases 3 to 5: a newer edit
 * is never overwritten by an older one, in whatever order copies arrive.
 */
import { describe, expect, it } from 'vitest';
import type { Row } from '../domain/values.ts';
import { deletionWins, fieldStamp, lastEditOf, mergeByField } from './merge.ts';

const record = (fields: Partial<Row>): Row => ({ id: 'r1', ...fields });

describe('deletions with a date', () => {
  const edited = record({
    comentario: 'Contestación presentada el miércoles',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-25T10:00:00.000Z',
    fieldTimestamps: { comentario: '2026-08-19T10:00:00.000Z' },
  });

  it('takes the last edit from every stamp, not from updatedAt', () => {
    expect(lastEditOf(edited)).toBe('2026-08-19T10:00:00.000Z');
  });

  it('an old deletion does not beat a later edit', () => {
    expect(deletionWins('2026-08-17T09:00:00.000Z', edited)).toBe(false);
  });

  it('a deletion after the last edit wins', () => {
    expect(deletionWins('2026-08-20T09:00:00.000Z', edited)).toBe(true);
  });

  it('a deletion without a date applies as it used to', () => {
    expect(deletionWins('', edited)).toBe(true);
  });

  it('compares instants, not strings, across offsets', () => {
    // 04:30 in Cancun is 09:30 UTC: later than the 09:00 deletion.
    const late = record({
      createdAt: '2026-08-01T10:00:00.000Z',
      fieldTimestamps: { comentario: '2026-08-20T04:30:00.000-05:00' },
    });
    expect(deletionWins('2026-08-20T09:00:00.000Z', late)).toBe(false);
  });
});

describe('merge field by field', () => {
  const onComputer = record({
    juzgado: 'JUZGADO PRIMERO CIVIL',
    comentario: 'lo viejo',
    createdAt: '2026-08-01T10:00:00.000Z',
    fieldTimestamps: {
      juzgado: '2026-08-19T10:00:00.000Z',
      comentario: '2026-08-10T10:00:00.000Z',
    },
  });
  const onPhone = record({
    juzgado: 'JUZGADO VIEJO',
    comentario: 'lo nuevo',
    createdAt: '2026-08-01T10:00:00.000Z',
    fieldTimestamps: {
      juzgado: '2026-08-05T10:00:00.000Z',
      comentario: '2026-08-20T10:00:00.000Z',
    },
  });

  it('each field keeps its most recent edit', () => {
    const merged = mergeByField(onComputer, onPhone);
    expect(merged.comentario).toBe('lo nuevo');
    expect(merged.juzgado).toBe('JUZGADO PRIMERO CIVIL');
  });

  it('converges: merging in the other order gives the same record', () => {
    const ab = mergeByField(onComputer, onPhone);
    const ba = mergeByField(onPhone, onComputer);
    expect(ba.comentario).toBe(ab.comentario);
    expect(ba.juzgado).toBe(ab.juzgado);
    expect(ba.fieldTimestamps).toEqual(ab.fieldTimestamps);
  });

  it('a field nobody touched does not overwrite an explicit edit', () => {
    const untouched = record({
      comentario: 'nunca tocado',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-25T10:00:00.000Z',
    });
    const explicit = record({
      comentario: 'editado a propósito',
      createdAt: '2026-08-01T10:00:00.000Z',
      fieldTimestamps: { comentario: '2026-08-15T10:00:00.000Z' },
    });
    expect(fieldStamp(untouched, 'comentario')).toBe('2026-08-01T10:00:00.000Z');
    expect(mergeByField(untouched, explicit).comentario).toBe('editado a propósito');
  });

  it('two filled values with the same stamp resolve the same way on both sides', () => {
    const a = record({ x: 'a', createdAt: '2026-08-01T10:00:00.000Z' });
    const b = record({ x: 'b', createdAt: '2026-08-01T10:00:00.000Z' });
    expect(mergeByField(a, b).x).toBe(mergeByField(b, a).x);
  });
});

describe('clearing a field on purpose', () => {
  const withText = record({
    comentario: 'algo escrito',
    createdAt: '2026-08-01T10:00:00.000Z',
    fieldTimestamps: { comentario: '2026-08-10T10:00:00.000Z' },
  });
  const cleared = record({
    comentario: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    fieldTimestamps: { comentario: '2026-08-20T10:00:00.000Z' },
  });

  it('is respected', () => {
    expect(mergeByField(withText, cleared).comentario).toBeNull();
  });

  it('converges in both directions', () => {
    expect(mergeByField(cleared, withText).comentario).toBeNull();
  });
});

describe('merging tombstones', () => {
  const base = {
    createdAt: '2026-08-01T10:00:00.000Z',
    fieldTimestamps: { titulo: '2026-08-10T10:00:00.000Z' },
    titulo: 'Asunto',
  };

  it('keeps a deletion later than every edit', () => {
    const deleted = record({ ...base, deleted: '2026-08-12T10:00:00.000Z' });
    expect(mergeByField(record(base), deleted).deleted).toBe('2026-08-12T10:00:00.000Z');
    expect(mergeByField(deleted, record(base)).deleted).toBe('2026-08-12T10:00:00.000Z');
  });

  it('drops a deletion that an edit made elsewhere later overrides', () => {
    const deleted = record({ ...base, deleted: '2026-08-12T10:00:00.000Z' });
    const editedLater = record({
      ...base,
      titulo: 'Asunto renombrado',
      fieldTimestamps: { titulo: '2026-08-15T10:00:00.000Z' },
    });
    const merged = mergeByField(deleted, editedLater);
    expect(merged.deleted).toBeNull();
    expect(merged.titulo).toBe('Asunto renombrado');
  });

  it('keeps the restore mark so an old deletion cannot win again', () => {
    const restored = record({
      ...base,
      deleted: null,
      fieldTimestamps: { ...base.fieldTimestamps, deleted: '2026-08-13T10:00:00.000Z' },
    });
    const staleDeletion = record({ ...base, deleted: '2026-08-12T10:00:00.000Z' });
    expect(mergeByField(staleDeletion, restored).deleted).toBeNull();
    expect(mergeByField(restored, staleDeletion).deleted).toBeNull();
  });
});
