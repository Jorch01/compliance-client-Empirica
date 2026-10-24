/**
 * F9, billing on the server: who gets it on their devices (and loses it), a
 * payment recorded offline for a month nobody recorded yet, the split that
 * only the partners set, the participants, the nightly bell, and clients
 * the firm only bills (D87). On the fictitious data set: the demo's lawyer
 * is authorized, lawyer B is not; client C is billing only.
 */
import { cobroId, periodFields, text, type Op, type Row } from '@empirica/shared';
import { ID, uid } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { runBillingNotices } from './actions/billing.ts';
import { Device, op } from './testing/device.ts';
import { createWorld, type World } from './testing/harness.ts';

const A = ID.clienteA;
const B = ID.clienteB;
const C = ID.clienteC;
const OCTOBER = cobroId(ID.honA, '2026-10');
const BILLING = ['Honorarios', 'Cobros', 'Pagos', 'Gastos', 'RecordatoriosCobro'] as const;

const billingOf = (d: Device): string[] =>
  [...d.store.values()]
    .filter((e) => (BILLING as readonly string[]).includes(e.t))
    .map((e) => e.row.id)
    .sort();

const notices = (w: World, tipo: string): [string, string, string][] =>
  w
    .rows('Notificaciones')
    .filter((n) => n.tipo === tipo)
    .map((n) => [text(n, 'usuarioId') ?? '', text(n, 'mensaje') ?? '', text(n, 'link') ?? '']);

/** October's fee period as the lawyer's device records it, and its payment. */
function payOctober(w: World): Op[] {
  const fee = w.row('Honorarios', ID.honA);
  if (!fee) throw new Error('no fee');
  return [
    op('Cobros', 'create', OCTOBER, {
      ...periodFields(fee, { periodo: '2026-10', fecha: '2026-10-01' }),
      folioFactura: 'F-0004 (ejemplo)',
    }),
    op('Pagos', 'create', uid(0x9101), {
      cobroId: OCTOBER,
      fecha: '2026-10-02',
      monto: 29000,
      metodo: 'TRANSFERENCIA',
    }),
  ];
}

describe('who gets billing on their devices', () => {
  it('the partners and the authorized lawyer; the rest of the firm and every client, nothing', () => {
    const w = createWorld();
    expect(billingOf(new Device(w, ID.socio).sync())).toHaveLength(15);
    const lawyer = new Device(w, ID.abogado).sync();
    expect(lawyer.ids('Cobros')).toEqual([ID.cobJul, ID.cobAgo, ID.cobSep, ID.cobC].sort());
    expect(lawyer.ids('RecordatoriosCobro')).toEqual([ID.recFactura, ID.recLlamar].sort());
    for (const userId of [ID.abogadoB, ID.asistente, ID.cAdmin, ID.cColab, ID.cB]) {
      expect(billingOf(new Device(w, userId).sync())).toEqual([]);
    }
  });

  it('the participants travel whole, only to who sees billing', () => {
    const w = createWorld();
    expect(new Device(w, ID.abogado).sync().snapshot?.Participantes).toHaveLength(3);
    expect(new Device(w, ID.abogadoB).sync().snapshot?.Participantes).toEqual([]);
    expect(new Device(w, ID.cAdmin).sync().snapshot?.Participantes).toEqual([]);
  });

  it('authorizing a lawyer brings his clients’ billing; taking it away, takes it from his device', () => {
    const w = createWorld();
    const lawyerB = new Device(w, ID.abogadoB).sync();
    expect(lawyerB.ids('Cobros')).toEqual([]);
    w.ok('admin.users.update', { usuarioId: ID.abogadoB, cobranza: true }, { as: ID.socio });
    lawyerB.sync();
    expect(lawyerB.last.resets).toEqual([B]);
    expect(lawyerB.ids('Cobros')).toEqual([ID.cobB]);
    expect(lawyerB.ids('Pagos')).toEqual([ID.pagB]);
    expect(lawyerB.snapshot?.Participantes).toHaveLength(3);

    const lawyer = new Device(w, ID.abogado).sync();
    w.ok('admin.users.update', { usuarioId: ID.abogado, cobranza: false }, { as: ID.socio });
    lawyer.sync();
    expect(billingOf(lawyer)).toEqual([]);
    expect(lawyer.ids('Asuntos').length).toBeGreaterThan(0);
    expect(lawyer.snapshot?.Participantes).toEqual([]);
    expect(
      w
        .rows('Bitacora')
        .some(
          (b) => b.entidad === 'Usuarios' && b.entidadId === ID.abogado && b.accion === 'EDITAR',
        ),
    ).toBe(true);
  });

  it('only the partners authorize, and only a lawyer', () => {
    const w = createWorld();
    expect(
      w.call('admin.users.update', { usuarioId: ID.abogadoB, cobranza: true }, { as: ID.abogado }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    for (const usuarioId of [ID.asistente, ID.cAdmin]) {
      expect(
        w.call('admin.users.update', { usuarioId, cobranza: true }, { as: ID.socio }),
      ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
  });
});

describe('clients the firm only bills (D87)', () => {
  it('reach the partners and the authorized lawyers, with their billing; nobody else', () => {
    const w = createWorld();
    for (const userId of [ID.socio, ID.abogado]) {
      const d = new Device(w, userId).sync();
      expect(d.ids('Clientes')).toContain(C);
      expect(d.ids('Cobros')).toContain(ID.cobC);
      expect(d.ids('Pagos')).toContain(ID.pagC);
    }
    // The assistant is assigned to it, and still never hears of it.
    for (const userId of [ID.asistente, ID.abogadoB, ID.cAdmin, ID.cB]) {
      const d = new Device(w, userId).sync();
      expect(d.ids('Clientes')).not.toContain(C);
      expect(d.last.changes.some((id) => id === C)).toBe(false);
    }
  });

  it('take billing only: no matter, task or unit is recorded there', () => {
    const w = createWorld();
    const lawyer = new Device(w, ID.abogado).sync();
    const [matter, unit, payment] = lawyer.push([
      op('Asuntos', 'create', uid(0x9201), {
        clienteId: C,
        titulo: 'Juicio (ejemplo)',
        area: 'CONTROVERSIAS',
        estado: 'ACTIVO',
        visibilidad: 'INTERNO',
      }),
      op('Entidades', 'create', uid(0x9202), { clienteId: C, nombre: 'Unidad', tipo: 'UNIDAD' }),
      op('Pagos', 'create', uid(0x9203), { cobroId: ID.cobC, fecha: '2026-10-20', monto: 1000 }),
    ]);
    expect(matter?.status).toBe('rejected');
    expect(unit?.status).toBe('rejected');
    expect(payment?.status).toBe('applied');
    expect(w.row('Asuntos', uid(0x9201))).toBeUndefined();
  });

  it('a partner opens one; it has nobody of its own, and no monthly report', () => {
    const w = createWorld();
    const partner = new Device(w, ID.socio).sync();
    const id = uid(0x9204);
    const [created] = partner.push([
      op('Clientes', 'create', id, {
        razonSocial: 'Otro Litigio Demo, S.C.',
        servicio: 'ASUNTO_PUNTUAL',
        estado: 'ACTIVO',
        soloCobranza: true,
      }),
    ]);
    expect(created?.status).toBe('applied');
    expect(new Device(w, ID.asistente).sync().ids('Clientes')).not.toContain(id);
    expect(
      w.call(
        'invitations.create',
        { email: 'nadie@cliente-c.example', lado: 'CLIENTE', rol: 'CLIENTE_ADMIN', clienteId: C },
        { as: ID.socio },
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(
      w.call(
        'admin.memberships.save',
        { usuarioId: ID.cB, clienteId: C, rol: 'CLIENTE_ADMIN' },
        { as: ID.socio },
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('moving a client in or out of the tracking portal downloads it again everywhere', () => {
    const w = createWorld();
    const assistant = new Device(w, ID.asistente).sync();
    const partner = new Device(w, ID.socio).sync();
    expect(assistant.ids('Clientes')).not.toContain(C);

    // C joins the tracking portal: the assistant assigned to it gets it now.
    partner.push([op('Clientes', 'update', C, { soloCobranza: false })]);
    assistant.sync();
    expect(assistant.ids('Clientes')).toContain(C);
    partner.sync();
    expect(partner.last.resets).toContain(C);

    // A leaves it: its tracking goes from every device, its billing stays with billing.
    expect(assistant.ids('Asuntos').length).toBeGreaterThan(0);
    const lawyer = new Device(w, ID.abogado).sync();
    partner.push([op('Clientes', 'update', A, { soloCobranza: true })]);
    assistant.sync();
    expect(assistant.ids('Clientes')).not.toContain(A);
    expect(assistant.ids('Asuntos')).toEqual([]);
    lawyer.sync();
    expect(lawyer.last.resets).toContain(A);
    expect(lawyer.ids('Asuntos')).toEqual([]);
    expect(lawyer.ids('Cobros')).toContain(ID.cobSep);
    expect(new Device(w, ID.cAdmin).sync().ids('Clientes')).toEqual([]);
    // Nothing was deleted: back in the portal, it is all there again.
    partner.push([
      op('Clientes', 'update', A, { soloCobranza: false }, { at: '2026-10-02T11:59:30.000-05:00' }),
    ]);
    expect(assistant.sync().ids('Asuntos').length).toBeGreaterThan(0);
  });
});

describe('recording payments', () => {
  it('a month nobody recorded yet: its fixed id, then its payment, in one go and offline', () => {
    const w = createWorld();
    const lawyer = new Device(w, ID.abogado).sync();
    const results = lawyer.push(payOctober(w));
    expect(results.map((r) => r.status)).toEqual(['applied', 'applied']);
    expect(w.row('Pagos', uid(0x9101))).toMatchObject({ clienteId: A, cobroId: OCTOBER });
    const log = w.rows('Bitacora').filter((b) => b.entidad === 'Cobros' || b.entidad === 'Pagos');
    expect(log.map((b) => [b.accion, b.entidad])).toEqual([
      ['CREAR', 'Cobros'],
      ['CREAR', 'Pagos'],
    ]);
    // The client never hears of it.
    expect(billingOf(new Device(w, ID.cAdmin).sync())).toEqual([]);
  });

  it('two devices that record the same month write one charge, and both payments land', () => {
    const w = createWorld();
    const lawyer = new Device(w, ID.abogado).sync();
    const partner = new Device(w, ID.socio).sync();
    lawyer.push(payOctober(w));
    const [charge, payment] = partner.push(
      payOctober(w).map((o, i) => (i === 1 ? { ...o, id: uid(0x9102) } : o)),
    );
    expect(charge).toMatchObject({ status: 'rejected', reason: 'ID_TAKEN' });
    expect(payment?.status).toBe('applied');
    expect(w.rows('Cobros').filter((c) => c.id === OCTOBER)).toHaveLength(1);
    expect(w.rows('Pagos').filter((p) => p.cobroId === OCTOBER)).toHaveLength(2);
  });

  it('the lawyer never sets the split, and amounts must make sense', () => {
    const w = createWorld();
    const lawyer = new Device(w, ID.abogado).sync();
    const [split, negative] = lawyer.push([
      op('Cobros', 'update', ID.cobSep, {
        reparto: [{ participanteId: ID.parAbogado, porcentaje: 100 }],
      }),
      op('Pagos', 'create', uid(0x9103), { cobroId: ID.cobSep, fecha: '2026-10-02', monto: -1 }),
    ]);
    expect(split).toMatchObject({ status: 'rejected', reason: 'FIELD_NOT_ALLOWED' });
    expect(negative).toMatchObject({ status: 'rejected', reason: 'INVALID_FIELDS' });
    const partner = new Device(w, ID.socio).sync();
    const [ok] = partner.push([
      op('Cobros', 'update', ID.cobSep, {
        reparto: [
          { participanteId: ID.parSocia, porcentaje: 70 },
          { participanteId: ID.parDespacho, porcentaje: 30 },
        ],
      }),
    ]);
    expect(ok?.status).toBe('applied');
  });

  it('a lawyer not authorized cannot write it either, nor learn it exists', () => {
    const w = createWorld();
    const [res] = new Device(w, ID.abogadoB)
      .sync()
      .push([
        op('Pagos', 'create', uid(0x9104), { cobroId: ID.cobB, fecha: '2026-10-02', monto: 1 }),
      ]);
    expect(res).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
    expect(w.row('Pagos', uid(0x9104))).toBeUndefined();
  });
});

describe('participants', () => {
  it('the partners add and change them; the others reach them in the next sync', () => {
    const w = createWorld();
    const lawyer = new Device(w, ID.abogado).sync();
    const { participante } = w.ok<{ participante: Row }>(
      'billing.participants.save',
      { nombre: 'Corresponsal Ficticio', tipo: 'EXTERNO', tasaImpuesto: 10 },
      { as: ID.socio },
    );
    expect(participante).not.toHaveProperty('alcanceHist');
    lawyer.sync();
    expect(lawyer.snapshot?.Participantes.map((p) => p.nombre)).toContain('Corresponsal Ficticio');
    w.ok(
      'billing.participants.save',
      {
        participanteId: participante.id,
        nombre: 'Corresponsal Ficticio',
        tipo: 'EXTERNO',
        activo: false,
      },
      { as: ID.socio },
    );
    expect(w.row('Participantes', participante.id)?.activo).toBe(false);
  });

  it('nobody else; only people of the firm, each once', () => {
    const w = createWorld();
    const save = (as: string, payload: Record<string, unknown>) =>
      w.call('billing.participants.save', { tipo: 'PERSONA', ...payload }, { as });
    expect(save(ID.abogado, { nombre: 'Yo' })).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(save(ID.socio, { nombre: 'Cliente', usuarioId: ID.cAdmin })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(save(ID.socio, { nombre: 'Otra vez', usuarioId: ID.abogado })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(save(ID.socio, { nombre: 'Asistente Demo', usuarioId: ID.asistente }).ok).toBe(true);
  });
});

describe('the nightly bell', () => {
  it('a reminder rings the day it falls, once, for the people it names', () => {
    const w = createWorld();
    w.clock.set('2026-10-01T03:00:00.000-05:00');
    expect(runBillingNotices(w.env)).toMatchObject({ reminders: 2 });
    expect(notices(w, 'COBRO_RECORDATORIO').sort()).toEqual(
      [
        [ID.abogado, 'Enviar la factura de la iguala (ejemplo)', '/cobranza/recordatorios'],
        // No one named: whoever wrote it (the partner).
        [ID.socio, 'Pedir el resto del registro de marca (ejemplo)', `/cobranza/cobros/${ID.cobB}`],
      ].sort(),
    );
    expect(w.row('RecordatoriosCobro', ID.recFactura)?.ultimoAviso).toBe('2026-10-01');
    expect(runBillingNotices(w.env)).toMatchObject({ reminders: 0, notices: 0 });
    w.clock.set('2026-10-05T03:00:00.000-05:00');
    runBillingNotices(w.env);
    expect(
      notices(w, 'COBRO_RECORDATORIO')
        .filter(([, m]) => m.startsWith('Llamar'))
        .map(([u]) => u)
        .sort(),
    ).toEqual([ID.socio, ID.abogado].sort());
  });

  it('an overdue charge, on its milestones, to whoever follows it and may see it', () => {
    const w = createWorld();
    // September was due on the 11th: a day late on the 12th.
    w.clock.set('2026-09-12T03:00:00.000-05:00');
    runBillingNotices(w.env);
    expect(notices(w, 'COBRO_VENCIDO')).toEqual([
      [
        ID.abogado,
        'Cliente Demo · Iguala mensual (ejemplo) · 2026-09',
        `/cobranza/cobros/${ID.cobSep}`,
      ],
    ]);
    // October, never recorded, a day late: the fee's lawyer.
    w.clock.set('2026-10-12T03:00:00.000-05:00');
    runBillingNotices(w.env);
    expect(notices(w, 'COBRO_VENCIDO').filter(([, , link]) => link.endsWith(OCTOBER))).toEqual([
      [
        ID.abogado,
        'Cliente Demo · Iguala mensual (ejemplo) · 2026-10',
        `/cobranza/cobros/${OCTOBER}`,
      ],
    ]);
  });

  it('a lawyer who may not see billing is never told: the partners are', () => {
    const w = createWorld();
    // Client B's job was due on 2026-09-25; its lawyer is not authorized.
    w.clock.set('2026-09-26T03:00:00.000-05:00');
    runBillingNotices(w.env);
    expect(
      notices(w, 'COBRO_VENCIDO')
        .filter(([, , link]) => link.endsWith(ID.cobB))
        .map(([u, m]) => [u, m]),
    ).toEqual([[ID.socio, 'Cliente Prueba Dos, S.A. de C.V. · Registro de marca (ejemplo)']]);
    // Paid by then: nothing.
    w.edit('Pagos', ID.pagB, { monto: 13920 });
    w.clock.set('2026-10-02T03:00:00.000-05:00');
    expect(runBillingNotices(w.env).overdue).toBe(0);
  });
});
