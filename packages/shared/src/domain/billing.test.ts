/**
 * Billing (F9): the amounts of a charge, the periods a fee earns, what is
 * owed and what each participant takes, on the fictitious data set (a fee
 * of 25,000 a month plus VAT for client A, a single job for client B).
 */
import { describe, expect, it } from 'vitest';
import { ID, demoData } from '../testing/fixtures.ts';
import {
  agingOf,
  amountsOf,
  chargeById,
  chargesOf,
  cobroId,
  earningsOf,
  feePeriods,
  monthRange,
  monthlySeries,
  nextReminder,
  parseReparto,
  reminderDates,
  reminderRecipients,
  remindsOn,
  shiftPeriod,
  splitOf,
  totalsOf,
  upcomingPeriods,
  type Charge,
} from './billing.ts';
import { TABLES } from './tables.ts';
import { validateFields } from './validate.ts';
import type { Row } from './values.ts';

const TODAY = '2026-10-02';

function setup(mutate?: (d: ReturnType<typeof demoData>) => void) {
  const d = demoData();
  mutate?.(d);
  const rows = { honorarios: d.Honorarios, cobros: d.Cobros, pagos: d.Pagos };
  const charges = chargesOf(rows, TODAY);
  const get = (id: string): Charge => {
    const c = charges.find((x) => x.id === id);
    if (!c) throw new Error(`no charge ${id}`);
    return c;
  };
  return { d, rows, charges, get };
}

const fee = (fields: Record<string, unknown>): Row => ({
  id: ID.honA,
  estado: 'ACTIVO',
  ...fields,
});

describe('what a billing field may hold', () => {
  it('money not negative, payments above zero, rates from 0 to 100', () => {
    expect(validateFields(TABLES.Pagos, { monto: 100 }).ok).toBe(true);
    expect(validateFields(TABLES.Pagos, { monto: 0 }).ok).toBe(false);
    expect(validateFields(TABLES.Gastos, { monto: -5 }).ok).toBe(false);
    expect(validateFields(TABLES.Cobros, { subtotal: 0 }).ok).toBe(true);
    expect(validateFields(TABLES.Cobros, { subtotal: -1 }).ok).toBe(false);
    expect(validateFields(TABLES.Cobros, { tasaIVA: 16 }).ok).toBe(true);
    expect(validateFields(TABLES.Cobros, { tasaIVA: 116 }).ok).toBe(false);
  });

  it('a fee’s rule as the form writes it', () => {
    expect(validateFields(TABLES.Honorarios, { cadaMeses: 3, diaCobro: -1 }).ok).toBe(true);
    expect(validateFields(TABLES.Honorarios, { cadaMeses: 4 }).ok).toBe(false);
    expect(validateFields(TABLES.Honorarios, { diaCobro: 30 }).ok).toBe(false);
    expect(validateFields(TABLES.Honorarios, { diasCredito: 2.5 }).ok).toBe(false);
    expect(validateFields(TABLES.Cobros, { periodo: '2026-13' }).ok).toBe(false);
  });

  it('a split of known shape that adds up to 100 at most', () => {
    const share = (p: number, id: string = ID.parSocia) => ({ participanteId: id, porcentaje: p });
    expect(
      validateFields(TABLES.Cobros, { reparto: [share(60), share(40, ID.parDespacho)] }).ok,
    ).toBe(true);
    expect(
      validateFields(TABLES.Cobros, { reparto: [share(60), share(50, ID.parDespacho)] }).ok,
    ).toBe(false);
    expect(validateFields(TABLES.Cobros, { reparto: [share(50), share(10)] }).ok).toBe(false);
    expect(validateFields(TABLES.Cobros, { reparto: [share(50, 'nadie')] }).ok).toBe(false);
    expect(validateFields(TABLES.Cobros, { reparto: [] }).ok).toBe(true);
    expect(validateFields(TABLES.RecordatoriosCobro, { destinatarios: [ID.socio, 'x'] }).ok).toBe(
      false,
    );
  });
});

describe('amounts', () => {
  it('adds VAT and takes off what the client withholds', () => {
    expect(amountsOf({ subtotal: 25000, tasaIVA: 16 })).toEqual({
      subtotal: 25000,
      iva: 4000,
      retencionISR: 0,
      retencionIVA: 0,
      total: 29000,
    });
    const withheld = amountsOf({
      subtotal: 10000,
      tasaIVA: 16,
      retencionISR: 10,
      retencionIVA: 10.6667,
    });
    expect(withheld).toEqual({
      subtotal: 10000,
      iva: 1600,
      retencionISR: 1000,
      retencionIVA: 1066.67,
      total: 9533.33,
    });
  });

  it('reads a fee by its amount, and a rate outside 0 to 100 as none', () => {
    expect(amountsOf({ monto: 1000, tasaIVA: 16 }).total).toBe(1160);
    expect(amountsOf({ subtotal: 1000, tasaIVA: 160 }).total).toBe(1000);
    expect(amountsOf({ subtotal: 'x' }).total).toBe(0);
  });
});

describe('the periods of a fee', () => {
  it('charges every month on its day from its start, up to today', () => {
    const { d } = setup();
    const honA = d.Honorarios[0];
    if (!honA) throw new Error('no fee');
    expect(feePeriods(honA, TODAY).map((p) => p.fecha)).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
  });

  it('starts on the first day of the rule from its start, and stops at its end', () => {
    expect(
      feePeriods(fee({ desde: '2026-07-15', cadaMeses: 1, diaCobro: 1 }), TODAY).map(
        (p) => p.fecha,
      ),
    ).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(
      feePeriods(fee({ desde: '2026-07-01', hasta: '2026-08-31', diaCobro: 1 }), TODAY).map(
        (p) => p.periodo,
      ),
    ).toEqual(['2026-07', '2026-08']);
  });

  it('every three months on the last day', () => {
    expect(
      feePeriods(fee({ desde: '2026-01-15', cadaMeses: 3, diaCobro: -1 }), '2026-12-31').map(
        (p) => p.fecha,
      ),
    ).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31']);
  });

  it('a fee without a start earns nothing; the next ones are listed', () => {
    expect(feePeriods(fee({ cadaMeses: 1, diaCobro: 1 }), TODAY)).toEqual([]);
    expect(
      upcomingPeriods(fee({ desde: '2026-07-01', cadaMeses: 1, diaCobro: 1 }), TODAY, 2),
    ).toEqual([
      { periodo: '2026-11', fecha: '2026-11-01' },
      { periodo: '2026-12', fecha: '2026-12-01' },
    ]);
    expect(upcomingPeriods(fee({ desde: '2026-07-01', estado: 'PAUSADO' }), TODAY)).toEqual([]);
  });
});

describe('charges', () => {
  it('lists the recorded months and earns the month nobody recorded yet', () => {
    const { charges, get } = setup();
    expect(charges.map((c) => c.id)).toEqual([
      cobroId(ID.honA, '2026-10'),
      ID.cobB,
      ID.cobSep,
      ID.cobAgo,
      ID.cobJul,
    ]);
    const october = get(cobroId(ID.honA, '2026-10'));
    expect(october.row).toBeNull();
    expect(october).toMatchObject({
      clienteId: ID.clienteA,
      periodo: '2026-10',
      fechaEmision: '2026-10-01',
      fechaVencimiento: '2026-10-11',
      status: 'POR_COBRAR',
      saldo: 29000,
      responsableId: ID.abogado,
    });
    expect(october.reparto.map((s) => s.porcentaje)).toEqual([50, 30, 20]);
  });

  it('says what each one stands at', () => {
    const { get } = setup();
    expect(get(ID.cobJul)).toMatchObject({ status: 'PAGADO', pagado: 29000, saldo: 0 });
    expect(get(ID.cobSep)).toMatchObject({ status: 'VENCIDO', diasVencido: 21, saldo: 29000 });
    // Half paid and past its date: overdue comes first.
    expect(get(ID.cobB)).toMatchObject({ status: 'VENCIDO', pagado: 6960, saldo: 6960 });
    expect(get(ID.cobB).ultimoPago).toBe('2026-09-20');
  });

  it('partly paid before its date; cancelled; paid in excess', () => {
    const { get } = setup((d) => {
      d.Pagos.push({
        ...d.Pagos[0],
        id: 'p-oct',
        cobroId: cobroId(ID.honA, '2026-10'),
        monto: 1000,
      });
      const sep = d.Cobros.find((c) => c.id === ID.cobSep);
      if (sep) sep.estado = 'CANCELADO';
      d.Pagos.push({ ...d.Pagos[0], id: 'p-jul2', monto: 500 });
    });
    expect(get(cobroId(ID.honA, '2026-10')).status).toBe('PARCIAL');
    expect(get(ID.cobSep).status).toBe('CANCELADO');
    expect(get(ID.cobJul)).toMatchObject({ status: 'PAGADO', saldo: -500 });
  });

  it('a paused fee earns no new month; its recorded ones stay', () => {
    const { charges } = setup((d) => {
      const f = d.Honorarios[0];
      if (f) f.estado = 'PAUSADO';
    });
    expect(charges.map((c) => c.id)).not.toContain(cobroId(ID.honA, '2026-10'));
    expect(charges.map((c) => c.id)).toContain(ID.cobSep);
  });

  it('a recorded month deleted is earned again, with its payments', () => {
    const { get } = setup((d) => {
      const sep = d.Cobros.find((c) => c.id === ID.cobSep);
      if (sep) sep.deleted = '2026-10-01T10:00:00.000-05:00';
      d.Pagos.push({ ...d.Pagos[0], id: 'p-sep', cobroId: ID.cobSep, monto: 29000 });
    });
    expect(get(ID.cobSep)).toMatchObject({ row: null, status: 'PAGADO' });
  });

  it('finds a charge by id, recorded or not', () => {
    const { rows } = setup();
    expect(chargeById(rows, cobroId(ID.honA, '2026-10'), TODAY)?.row).toBeNull();
    expect(chargeById(rows, ID.cobJul, TODAY)?.row?.id).toBe(ID.cobJul);
    expect(chargeById(rows, cobroId(ID.honA, '2026-11'), TODAY)).toBeNull();
  });
});

describe('the split', () => {
  it('reads only well-formed shares, once each', () => {
    expect(
      parseReparto([
        { participanteId: 'a', porcentaje: 60 },
        { participanteId: 'a', porcentaje: 10 },
        { participanteId: 'b', porcentaje: 0 },
        { participanteId: 'c', porcentaje: '30' },
        'x',
        { participanteId: 'd', porcentaje: 40 },
      ]),
    ).toEqual([
      { participanteId: 'a', porcentaje: 60 },
      { participanteId: 'd', porcentaje: 40 },
    ]);
    expect(parseReparto('nope')).toEqual([]);
  });

  it('takes VAT out, then shared expenses, splits, and gives back what someone paid', () => {
    const { d, get } = setup();
    const split = splitOf(get(ID.cobJul), { gastos: d.Gastos, participantes: d.Participantes });
    expect(split).toMatchObject({
      proporcion: 1,
      cobradoSinIVA: 25000,
      ivaPorEnterar: 4000,
      gastosComunes: 300,
      base: 24700,
      porcentajeAsignado: 100,
    });
    const by = new Map(split.lines.map((l) => [l.participanteId, l]));
    expect(by.get(ID.parSocia)).toMatchObject({ bruto: 12350, impuesto: 3705, neto: 8645 });
    expect(by.get(ID.parAbogado)).toMatchObject({
      bruto: 7410,
      impuesto: 1482,
      reembolso: 300,
      neto: 6228,
    });
    expect(by.get(ID.parDespacho)).toMatchObject({ bruto: 4940, impuesto: 0, neto: 4940 });
    expect(split.lines).toHaveLength(3);
  });

  it('splits only what came in', () => {
    const { d, get } = setup();
    const split = splitOf(get(ID.cobB), { gastos: d.Gastos, participantes: d.Participantes });
    expect(split.proporcion).toBe(0.5);
    expect(split.base).toBe(6000);
    expect(split.lines.map((l) => [l.participanteId, l.neto])).toEqual([
      [ID.parSocia, 2520],
      [ID.parDespacho, 2400],
    ]);
  });

  it('an expense on one person comes out of their part only', () => {
    const { d, get } = setup((data) => {
      data.Gastos.push({
        ...data.Gastos[0],
        id: 'g-own',
        cobroId: ID.cobAgo,
        monto: 1000,
        aCargoDe: ID.parAbogado,
      });
    });
    const split = splitOf(get(ID.cobAgo), { gastos: d.Gastos, participantes: d.Participantes });
    expect(split.base).toBe(24850);
    const lawyer = split.lines.find((l) => l.participanteId === ID.parAbogado);
    // 30 % of 24,850 = 7,455; minus 1,000 of his own; 20 % tax on 6,455.
    expect(lawyer).toMatchObject({ bruto: 7455, gastosPropios: 1000, impuesto: 1291, neto: 5164 });
  });

  it('shows the part nobody was given, and anyone who bears an expense', () => {
    const { get } = setup();
    const charge: Charge = {
      ...get(ID.cobJul),
      reparto: [{ participanteId: ID.parSocia, porcentaje: 80 }],
    };
    const split = splitOf(charge, {
      gastos: [{ id: 'g', cobroId: ID.cobJul, monto: 100, aCargoDe: ID.parAbogado }],
    });
    expect(split.porcentajeAsignado).toBe(80);
    expect(split.lines.map((l) => [l.participanteId, l.porcentaje, l.neto])).toEqual([
      [ID.parSocia, 80, 20000],
      [ID.parAbogado, 0, -100],
      [null, 20, 5000],
    ]);
  });

  it('a cancelled charge splits nothing', () => {
    const { get } = setup((d) => {
      const jul = d.Cobros.find((c) => c.id === ID.cobJul);
      if (jul) jul.estado = 'CANCELADO';
    });
    expect(splitOf(get(ID.cobJul)).base).toBe(0);
  });
});

describe('the dashboard', () => {
  it('earned this month, received, owed and overdue', () => {
    const { d, charges } = setup();
    expect(totalsOf(charges, d.Pagos, monthRange('2026-10')).MXN).toEqual({
      devengado: 29000,
      cobrado: 0,
      porCobrar: 64960,
      vencido: 35960,
    });
    expect(totalsOf(charges, d.Pagos, monthRange('2026-09')).MXN).toMatchObject({
      devengado: 42920,
      cobrado: 6960,
    });
    expect(totalsOf(charges, d.Pagos, monthRange('2026-10')).USD.porCobrar).toBe(0);
  });

  it('what is owed by how late it is', () => {
    const { charges } = setup();
    expect(agingOf(charges, 'MXN')).toEqual({
      alCorriente: 29000,
      d1a30: 35960,
      d31a60: 0,
      d61a90: 0,
      mas90: 0,
    });
  });

  it('month by month, earned and received', () => {
    const { d, charges } = setup();
    expect(monthlySeries(charges, d.Pagos, '2026-10', 'MXN', 4)).toEqual([
      { periodo: '2026-07', devengado: 29000, cobrado: 29000 },
      { periodo: '2026-08', devengado: 29000, cobrado: 29000 },
      { periodo: '2026-09', devengado: 42920, cobrado: 6960 },
      { periodo: '2026-10', devengado: 29000, cobrado: 0 },
    ]);
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
  });

  it('what each one took from a month’s payments', () => {
    const { d, charges } = setup();
    const rows = { pagos: d.Pagos, gastos: d.Gastos, participantes: d.Participantes };
    const july = earningsOf(charges, rows, monthRange('2026-07'), 'MXN');
    expect(july.map((e) => [e.participanteId, e.neto])).toEqual([
      [ID.parSocia, 8645],
      [ID.parAbogado, 6228],
      [ID.parDespacho, 4940],
    ]);
    const september = earningsOf(charges, rows, monthRange('2026-09'), 'MXN');
    expect(september.map((e) => [e.participanteId, e.bruto, e.impuesto, e.neto])).toEqual([
      [ID.parSocia, 3600, 1080, 2520],
      [ID.parDespacho, 2400, 0, 2400],
    ]);
    expect(earningsOf(charges, rows, monthRange('2026-10'), 'MXN')).toEqual([]);
  });
});

describe('reminders', () => {
  const rec = (fields: Record<string, unknown>): Row => ({
    id: 'r',
    activo: true,
    createdBy: ID.abogado,
    ...fields,
  });

  it('monthly on its day, and on the last day of shorter months', () => {
    const { d } = setup();
    const factura = d.RecordatoriosCobro.find((r) => r.id === ID.recFactura);
    if (!factura) throw new Error('no reminder');
    expect(remindsOn(factura, '2026-10-01')).toBe(true);
    expect(remindsOn(factura, TODAY)).toBe(false);
    expect(nextReminder(factura, TODAY)).toBe('2026-11-01');
    expect(
      reminderDates(rec({ fecha: '2026-01-31', repetir: 'MENSUAL' }), '2026-01-01', '2026-04-30'),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('weekly from long ago lands on the same weekday', () => {
    expect(nextReminder(rec({ fecha: '2025-01-06', repetir: 'SEMANAL' }), '2026-10-01')).toBe(
      '2026-10-05',
    );
    expect(
      reminderDates(rec({ fecha: '2026-10-01', repetir: 'QUINCENAL' }), '2026-10-01', '2026-10-31'),
    ).toEqual(['2026-10-01', '2026-10-16', '2026-10-31']);
  });

  it('once; until a date; off', () => {
    expect(reminderDates(rec({ fecha: '2026-10-05', repetir: 'NO' }), TODAY, '2027-01-01')).toEqual(
      ['2026-10-05'],
    );
    expect(nextReminder(rec({ fecha: '2026-10-01', repetir: 'NO' }), TODAY)).toBeNull();
    expect(
      reminderDates(
        rec({ fecha: '2026-10-01', repetir: 'SEMANAL', hasta: '2026-10-10' }),
        TODAY,
        '2026-12-31',
      ),
    ).toEqual(['2026-10-08']);
    expect(nextReminder(rec({ fecha: '2026-10-05', repetir: 'NO', activo: false }), TODAY)).toBe(
      null,
    );
  });

  it('goes to the people it names, else to whoever wrote it', () => {
    expect(reminderRecipients(rec({ destinatarios: [ID.socio, ID.socio, ''] }))).toEqual([
      ID.socio,
    ]);
    expect(reminderRecipients(rec({ destinatarios: [] }))).toEqual([ID.abogado]);
  });
});
