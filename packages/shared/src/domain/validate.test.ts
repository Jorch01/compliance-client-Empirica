import { describe, expect, it } from 'vitest';
import { TABLES } from './tables.ts';
import { LIMITS, missingRequired, validateFields } from './validate.ts';

const ID = '00000000-0000-4000-8000-000000000001';

describe('validateFields', () => {
  it('accepts well-formed values and normalizes empty ones to null', () => {
    const r = validateFields(TABLES.Tareas, {
      titulo: 'Entregar acta',
      asuntoId: ID,
      fechaLimite: '2026-10-15',
      esFatal: true,
      checklist: [{ id: 'c1', texto: 'x', hecho: false }],
      estado: 'EN_CURSO',
      descripcion: '',
    });
    expect(r).toEqual({
      ok: true,
      fields: {
        titulo: 'Entregar acta',
        asuntoId: ID,
        fechaLimite: '2026-10-15',
        esFatal: true,
        checklist: [{ id: 'c1', texto: 'x', hecho: false }],
        estado: 'EN_CURSO',
        descripcion: null,
      },
    });
  });

  it('rejects unknown and system columns', () => {
    const r = validateFields(TABLES.Tareas, { hacker: 1, version: 99, serverSeq: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toEqual([
        { field: 'hacker', code: 'UNKNOWN_FIELD' },
        { field: 'version', code: 'SYSTEM_FIELD' },
        { field: 'serverSeq', code: 'SYSTEM_FIELD' },
      ]);
    }
  });

  it.each([
    ['estado', 'TERMINADO'],
    ['fechaLimite', '15/10/2026'],
    ['asuntoId', 'not-a-uuid'],
    ['esFatal', 'sí'],
    ['titulo', 42],
  ])('rejects %s = %j', (field, value) => {
    const r = validateFields(TABLES.Tareas, { [field]: value });
    expect(r).toMatchObject({ ok: false, issues: [{ field, code: 'INVALID' }] });
  });

  it('rejects datetimes without an offset', () => {
    expect(validateFields(TABLES.Eventos, { inicio: '2026-10-20T10:00:00' }).ok).toBe(false);
    expect(validateFields(TABLES.Eventos, { inicio: '2026-10-20T10:00:00-05:00' }).ok).toBe(true);
  });

  it('keeps every value within what a sheet cell holds', () => {
    expect(validateFields(TABLES.Tareas, { titulo: 'x'.repeat(LIMITS.string + 1) })).toMatchObject({
      ok: false,
      issues: [{ code: 'TOO_LONG' }],
    });
    expect(
      validateFields(TABLES.Tareas, { checklist: [{ texto: 'x'.repeat(LIMITS.json) }] }),
    ).toMatchObject({ ok: false, issues: [{ code: 'TOO_LONG' }] });
  });

  it('forbids emptying a mandatory column', () => {
    expect(validateFields(TABLES.Tareas, { titulo: null })).toMatchObject({
      ok: false,
      issues: [{ field: 'titulo', code: 'REQUIRED' }],
    });
  });

  it('lower-cases emails', () => {
    expect(validateFields(TABLES.Usuarios, { email: ' Ana@Ejemplo.MX ' })).toEqual({
      ok: true,
      fields: { email: 'ana@ejemplo.mx' },
    });
  });
});

describe('missingRequired', () => {
  it('lists the mandatory columns a new record lacks', () => {
    expect(missingRequired(TABLES.Tareas, { titulo: 'x' }).sort()).toEqual(
      ['clienteId', 'estado', 'ladoResponsable', 'visibilidad'].sort(),
    );
  });
});
