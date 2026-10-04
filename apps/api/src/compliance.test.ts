/**
 * Phase 4: an obligation's next due date (`Obligaciones.proximoVencimiento`)
 * is its first period not yet validated, and the server keeps it so: it
 * moves forward when the firm validates that period and back when a
 * validation is withdrawn. A client's evidence alone moves nothing.
 */
import { ID, uid } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { Device, op } from './testing/device.ts';
import { createWorld, type World } from './testing/harness.ts';

const due = (w: World, id: string = ID.obNorte): unknown =>
  w.row('Obligaciones', id)?.proximoVencimiento ?? null;

/** The firm validates a record, having seen it as it stands (`base`: its version 1 if not given). */
const validate = (
  by: string,
  id: string,
  extra: { base?: Record<string, string | null>; at?: string } = {},
) =>
  op(
    'CumplimientosHistorial',
    'update',
    id,
    { estado: 'VALIDADO', validadoPor: by },
    extra.base
      ? { base: extra.base, ...(extra.at ? { at: extra.at } : {}) }
      : { baseVersion: 1, ...(extra.at ? { at: extra.at } : {}) },
  );

describe('an obligation’s next due date', () => {
  it('moves to the next period once the firm validates the one in review', () => {
    const w = createWorld();
    expect(due(w)).toBe('2026-09-12');
    const [result] = new Device(w, ID.abogado).push([validate(ID.abogado, ID.cuNorte)]);
    expect(result).toMatchObject({ status: 'applied' });
    expect(due(w)).toBe('2026-10-12');
    expect(
      w
        .rows('Bitacora')
        .some(
          (b) =>
            b.accion === 'SISTEMA' &&
            b.entidadId === ID.obNorte &&
            JSON.stringify(b.despues) === JSON.stringify({ proximoVencimiento: '2026-10-12' }),
        ),
    ).toBe(true);
    // The client's devices learn the new date with the next sync.
    expect(new Device(w, ID.cColab).sync().get('Obligaciones', ID.obNorte)).toMatchObject({
      proximoVencimiento: '2026-10-12',
    });
  });

  it('stays where it is when a client sends evidence', () => {
    const w = createWorld();
    const doc = uid(0xc101);
    const results = new Device(w, ID.cColab).push([
      op('Documentos', 'create', doc, {
        vinculo: { tipo: 'Obligaciones', id: ID.obNorte },
        nombre: 'acuse-octubre.pdf',
        visibilidad: 'COMPARTIDO',
      }),
      op('CumplimientosHistorial', 'create', uid(0xc102), {
        obligacionId: ID.obNorte,
        periodo: '2026-10-12',
        fechaCumplimiento: '2026-10-02',
        evidenciaDocId: doc,
        notas: 'Enviado',
      }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['applied', 'applied']);
    expect(w.row('CumplimientosHistorial', uid(0xc102))).toMatchObject({
      estado: 'EN_REVISION',
      clienteId: ID.clienteA,
      entidadId: ID.norte,
    });
    expect(due(w)).toBe('2026-09-12');
  });

  it('skips every period the firm already validated ahead', () => {
    const w = createWorld();
    new Device(w, ID.asistente).push([
      op('CumplimientosHistorial', 'create', uid(0xc103), {
        obligacionId: ID.obNorte,
        periodo: '2026-10-12',
        estado: 'VALIDADO',
        validadoPor: ID.asistente,
      }),
    ]);
    expect(due(w)).toBe('2026-09-12');
    new Device(w, ID.abogado).push([validate(ID.abogado, ID.cuNorte)]);
    expect(due(w)).toBe('2026-11-12');
  });

  it('goes back to a period whose validation is withdrawn or deleted', () => {
    const w = createWorld();
    const socio = new Device(w, ID.socio);
    socio.push([
      op(
        'CumplimientosHistorial',
        'update',
        ID.cuNorteAgo,
        { estado: 'RECHAZADO', notas: 'El acuse no corresponde' },
        { base: { estado: 'VALIDADO' } },
      ),
    ]);
    expect(due(w)).toBe('2026-08-12');
    // Validated again: forward to the period in review.
    socio.push([
      validate(ID.socio, ID.cuNorteAgo, {
        base: { estado: 'RECHAZADO', validadoPor: ID.abogado },
        at: '2026-10-02T11:59:30.000-05:00',
      }),
    ]);
    expect(w.row('CumplimientosHistorial', ID.cuNorteAgo)).toMatchObject({ estado: 'VALIDADO' });
    expect(due(w)).toBe('2026-09-12');

    socio.push([
      op('CumplimientosHistorial', 'delete', ID.cuNorteJul, undefined, {
        at: '2026-10-02T11:59:40.000-05:00',
      }),
    ]);
    expect(due(w)).toBe('2026-07-12');
  });

  it('a one-time obligation keeps its only date once complied with', () => {
    const w = createWorld();
    new Device(w, ID.abogado).push([
      op('CumplimientosHistorial', 'create', uid(0xc104), {
        obligacionId: ID.obHub,
        periodo: '2026-10-09',
        estado: 'VALIDADO',
        validadoPor: ID.abogado,
      }),
    ]);
    expect(due(w, ID.obHub)).toBe('2026-10-09');
  });

  it('is written once per push, however many periods were validated', () => {
    const w = createWorld();
    const before = w.rows('Bitacora').length;
    new Device(w, ID.abogado).push([
      validate(ID.abogado, ID.cuNorte),
      op('CumplimientosHistorial', 'create', uid(0xc105), {
        obligacionId: ID.obNorte,
        periodo: '2026-10-12',
        estado: 'VALIDADO',
        validadoPor: ID.abogado,
      }),
    ]);
    expect(due(w)).toBe('2026-11-12');
    const moves = w
      .rows('Bitacora')
      .slice(before)
      .filter((b) => b.accion === 'SISTEMA' && b.entidadId === ID.obNorte);
    expect(moves).toHaveLength(1);
  });

  it('nobody signs a validation in someone else’s name, and clients never validate', () => {
    const w = createWorld();
    const [forged] = new Device(w, ID.asistente).push([validate(ID.abogado, ID.cuNorte)]);
    expect(forged).toMatchObject({
      status: 'rejected',
      reason: 'FORCED_VALUE',
      field: 'validadoPor',
    });
    const [client] = new Device(w, ID.cAdmin).push([validate(ID.cAdmin, ID.cuNorte)]);
    expect(client).toMatchObject({ status: 'rejected', code: 'FORBIDDEN' });
    expect(due(w)).toBe('2026-09-12');
  });
});
