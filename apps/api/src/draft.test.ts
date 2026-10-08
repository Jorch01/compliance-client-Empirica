/**
 * Phase 8: "Crear con IA" (PLAN.md § 24, D73–D77). Only the client's
 * lawyers use it; Google reads markers, never a name nor what looks like an
 * e-mail, a phone, an RFC or an amount; the answer becomes the portal's
 * columns, all INTERNO, with nothing legal made up; nothing is written until
 * the lawyer creates it, and then the Bitacora says CREAR_IA.
 */
import {
  draftIssues,
  text,
  type AiDraftData,
  type ApiFailure,
  type DraftItem,
  type TableName,
} from '@empirica/shared';
import { ID, uid } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { DRAFT_PREFIX } from './actions/draft.ts';
import { Masker, scrub } from './ai/mask.ts';
import { Device, op } from './testing/device.ts';
import { createWorld, type World } from './testing/harness.ts';

const A = ID.clienteA;
const MARKER = /^\[[A-Z]+_\d+\]$/;

const draft = (w: World, as: string, peticion: string, extra: Record<string, string> = {}) =>
  w.call<AiDraftData>('ai.draft', { clienteId: A, peticion, ...extra }, { as });

function proposal(w: World, as: string, peticion: string, extra?: Record<string, string>) {
  const res = draft(w, as, peticion, extra);
  if (!res.ok) throw new Error(`${res.error.code} ${res.error.message}`);
  return res.data;
}

const failure = (res: unknown): ApiFailure['error'] => {
  const r = res as ApiFailure;
  expect(r.ok).toBe(false);
  return r.error;
};

/** What the last call sent to Gemini (the prompt is JSON). */
const sent = (w: World): Record<string, unknown> =>
  JSON.parse(w.google.gemini.calls.at(-1)?.prompt ?? '{}') as Record<string, unknown>;

const nth = (items: readonly DraftItem[], i: number): DraftItem => {
  const item = items[i];
  if (!item) throw new Error(`no item ${String(i)}`);
  return item;
};

/** Every name the portal holds about its clients: none may reach Google. */
function namesIn(w: World): string[] {
  const fields: [TableName, string[]][] = [
    ['Clientes', ['razonSocial', 'nombreComercial', 'rfc']],
    ['Entidades', ['nombre', 'rfc']],
    ['Usuarios', ['nombre', 'email']],
    ['Asuntos', ['titulo']],
    ['Tareas', ['titulo']],
    ['Obligaciones', ['nombre', 'autoridad']],
    ['Tramites', ['titulo', 'autoridad', 'folioExpediente']],
    ['Contratos', ['contraparte', 'tipo']],
    ['Eventos', ['titulo']],
    ['Solicitudes', ['titulo']],
    ['Documentos', ['nombre']],
    ['PlantillasTramite', ['nombre', 'autoridad']],
    ['CatalogoObligaciones', ['nombre', 'autoridad']],
  ];
  const names = new Set<string>();
  for (const [table, columns] of fields) {
    for (const row of w.rows(table)) {
      for (const c of columns) {
        const value = text(row, c);
        if (value && value.length >= 4) names.add(value);
      }
    }
  }
  return [...names];
}

function expectNoNames(w: World): void {
  const names = namesIn(w);
  expect(names.length).toBeGreaterThan(20);
  expect(w.google.gemini.calls.length).toBeGreaterThan(0);
  for (const call of w.google.gemini.calls) {
    for (const name of names) {
      expect(call.prompt, name).not.toContain(name);
      expect(call.system, name).not.toContain(name);
    }
  }
}

describe('who creates with the AI (D73)', () => {
  it('the client’s lawyers: the SOCIO_ADMIN and its ABOGADO; nobody else, and nothing goes to Google', () => {
    const w = createWorld();
    expect(draft(w, ID.socio, 'Abre un asunto de revisión').ok).toBe(true);
    expect(draft(w, ID.abogado, 'Abre un asunto de revisión').ok).toBe(true);
    const calls = w.google.gemini.calls.length;
    expect(failure(draft(w, ID.asistente, 'Abre un asunto')).code).toBe('FORBIDDEN');
    for (const client of [ID.cAdmin, ID.cColab, ID.cLectura]) {
      expect(failure(draft(w, client, 'Abre un asunto')).code).toBe('FORBIDDEN');
    }
    // Another client's lawyer, or anyone of another client, does not see this one.
    expect(failure(draft(w, ID.abogadoB, 'Abre un asunto')).code).toBe('NOT_FOUND');
    expect(failure(draft(w, ID.cB, 'Abre un asunto')).code).toBe('NOT_FOUND');
    expect(w.google.gemini.calls).toHaveLength(calls);
  });

  it('with the AI off for the client, nothing about it goes to Google', () => {
    const w = createWorld();
    w.edit('Clientes', A, { modoIA: 'OFF' });
    expect(failure(draft(w, ID.socio, 'Abre un asunto'))).toMatchObject({
      code: 'FORBIDDEN',
      details: { reason: 'AI_OFF' },
    });
    expect(w.google.gemini.calls).toHaveLength(0);
  });

  it('a unit or a matter of another client is not found', () => {
    const w = createWorld();
    expect(failure(draft(w, ID.socio, 'Tareas', { entidadId: ID.unidadB })).code).toBe('NOT_FOUND');
    expect(failure(draft(w, ID.socio, 'Tareas', { asuntoId: ID.asB })).code).toBe('NOT_FOUND');
    expect(w.google.gemini.calls).toHaveLength(0);
  });
});

describe('what leaves for Google (D74)', () => {
  it('the request: a marker for every name the portal knows, nothing that looks like contact data or money', () => {
    const w = createWorld();
    proposal(
      w,
      ID.abogado,
      'Para Cliente Demo, S.A. de C.V. (RFC CDE010101AB1), en Unidad Norte: tareas para Licencia de funcionamiento. ' +
        'Que Abogado Demo revise con Admin A (admin@cliente-a.example, 998 123 4567); honorarios de $150,000 MXN; ' +
        'CURP GODE561231HDFRRN09.',
    );
    const peticion = String(sent(w).peticion);
    expect(peticion).toBe(
      'Para [CLIENTE_1] (RFC [RFC]), en [UNIDAD_1]: tareas para [ASUNTO_2]. ' +
        'Que [PERSONA_2] revise con [PERSONA_5] ([CORREO], [NUMERO]); honorarios de [MONTO]; CURP [CURP].',
    );
    expectNoNames(w);
  });

  it('the client’s structure goes as markers: units, people who can be assigned, open matters, templates, catalog', () => {
    const w = createWorld();
    proposal(w, ID.abogado, 'Abre un asunto');
    const input = sent(w) as {
      hoy: string;
      diaDeLaSemana: string;
      cliente: string;
      unidades: { ref: string; tipo: string; perteneceA: string | null }[];
      personasDelDespacho: { ref: string; rol: string }[];
      personasDelCliente: string[];
      asuntosAbiertos: { ref: string; area: string; estado: string }[];
      plantillasDeTramite: { ref: string; etapas: number }[];
      catalogoDeObligaciones: { ref: string; categoria: string; repeticion: string }[];
    };
    expect(input).toMatchObject({
      hoy: '2026-10-02',
      diaDeLaSemana: 'viernes',
      cliente: '[CLIENTE_1]',
    });
    expect(input.unidades).toHaveLength(3);
    // The branch says which unit it belongs to, by marker.
    expect(input.unidades.filter((u) => u.perteneceA)).toHaveLength(1);
    // The firm people of client A (not the lawyer of B); the active people of the client.
    expect(input.personasDelDespacho.map((p) => p.rol).sort()).toEqual([
      'ABOGADO',
      'ASISTENTE',
      'SOCIO_ADMIN',
    ]);
    expect(input.personasDelCliente).toHaveLength(4);
    // The firm sees its internal matter too; the other client's is not there.
    expect(input.asuntosAbiertos).toHaveLength(4);
    expect(input.plantillasDeTramite).toEqual([{ ref: '[PLANTILLA_1]', etapas: 4 }]);
    expect(input.catalogoDeObligaciones[0]).toMatchObject({
      ref: '[CATALOGO_1]',
      categoria: 'CORPORATIVO',
      repeticion: 'FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=12',
    });
    const refs = [
      ...input.unidades.map((u) => u.ref),
      ...input.personasDelDespacho.map((p) => p.ref),
      ...input.personasDelCliente,
      ...input.asuntosAbiertos.map((a) => a.ref),
    ];
    for (const ref of refs) expect(ref).toMatch(MARKER);
    const [call] = w.google.gemini.calls;
    expect(call?.schemaKeys).toEqual(['explicacion', 'elementos']);
    expect(call?.system).toContain('No inventes hechos, fechas, plazos');
    expect(call?.system).toContain('Nunca pongas un plazo legal que la petición no diga');
    expectNoNames(w);
  });
});

describe('the proposal (D75, D76)', () => {
  it('a matter, its tasks and a meeting: the portal’s columns, all internal, linked by key; nothing written', () => {
    const w = createWorld();
    const before = w.rows('Asuntos').length;
    const { items, explicacion } = proposal(
      w,
      ID.abogado,
      'Abre un asunto con dos tareas y una reunión',
    );
    expect(explicacion).toContain('demostración');
    expect(items.map((i) => [i.key, i.table])).toEqual([
      ['E1', 'Asuntos'],
      ['E2', 'Tareas'],
      ['E3', 'Tareas'],
      ['E4', 'Eventos'],
    ]);
    for (const item of items) {
      expect(item.fields).toMatchObject({ clienteId: A, visibilidad: 'INTERNO' });
      expect(draftIssues(item)).toEqual([]);
    }
    expect(nth(items, 0).fields).toMatchObject({
      titulo: 'Revisión de contrato (demostración)',
      area: 'CONTRATOS',
      estado: 'ACTIVO',
      responsableId: ID.abogado,
    });
    expect(nth(items, 1)).toMatchObject({
      links: { asuntoId: 'E1' },
      fields: {
        ladoResponsable: 'CLIENTE',
        responsableId: null,
        estado: 'POR_HACER',
        fechaLimite: '2026-10-05',
        esFatal: false,
      },
      review: ['fechaLimite'],
    });
    expect(nth(items, 2)).toMatchObject({
      links: { asuntoId: 'E1', dependeDe: 'E2' },
      fields: { ladoResponsable: 'EMPIRICA', responsableId: ID.abogado },
      review: [],
    });
    expect(nth(items, 3)).toMatchObject({
      links: { asuntoId: 'E1' },
      fields: {
        tipo: 'REUNION',
        todoElDia: false,
        inicio: '2026-10-12T10:00:00.000-05:00',
        fin: '2026-10-12T11:00:00.000-05:00',
      },
      review: ['inicio'],
    });
    // The AI only proposes: the lawyer creates it from the preview.
    expect(w.rows('Asuntos')).toHaveLength(before);
  });

  it('within a matter: tasks for it, with its tasks and state as the AI’s context', () => {
    const w = createWorld();
    const { items } = proposal(w, ID.abogado, 'Sugiere las tareas que faltan', {
      asuntoId: ID.asNorte,
    });
    expect(sent(w).asuntoElegido).toMatchObject({
      ref: expect.stringMatching(MARKER) as unknown,
      area: 'COMPLIANCE',
      estado: 'ACTIVO',
    });
    const tasks = (sent(w).asuntoElegido as { tareas: { ref: string }[] }).tareas;
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) expect(t.ref).toMatch(MARKER);
    expect(items.map((i) => i.fields.asuntoId)).toEqual([ID.asNorte, ID.asNorte, ID.asNorte]);
    expect(nth(items, 0).fields.checklist).toEqual([
      { id: expect.any(String) as unknown, texto: 'Copia del documento vigente', hecho: false },
      {
        id: expect.any(String) as unknown,
        texto: 'Identificación del representante',
        hecho: false,
      },
    ]);
    expect(nth(items, 1).links).toEqual({ dependeDe: 'E1' });
    expect(nth(items, 2).links).toEqual({ dependeDe: 'E2' });
    expectNoNames(w);
  });

  it('what the AI makes up is left out: markers that are not the client’s, other kinds, bad values', () => {
    const w = createWorld();
    w.google.gemini.reply = () => ({
      explicacion: 'Propuesta con [PERSONA_77].',
      elementos: [
        {
          tipo: 'TAREA',
          clave: 'E1',
          titulo: 'Tarea de [PERSONA_77] en [UNIDAD_99]',
          responsable: '[PERSONA_77]',
          unidad: '[UNIDAD_99]',
          asunto: '[ASUNTO_55]',
          deQuien: 'nadie',
          prioridad: 'altísima',
          fecha: '2026-02-30',
        },
        { tipo: 'FACTURA', clave: 'E2', titulo: 'Cobrar' },
        { tipo: 'ASUNTO', clave: 'E3', titulo: 'Asunto', area: 'COCINA', fecha: '1999-01-01' },
        { tipo: 'TRAMITE', clave: 'E4', titulo: 'Trámite', plantilla: '[PLANTILLA_9]' },
        { noEs: 'un elemento' },
        ...Array.from({ length: 14 }, (_, i) => ({
          tipo: 'TAREA',
          clave: 'E1',
          titulo: `Paso ${String(i + 1)}`,
        })),
      ],
    });
    const { items, explicacion } = proposal(w, ID.abogado, 'Organiza el trabajo');
    expect(explicacion).toBe('Propuesta con .');
    // Fifteen at most, of the six kinds; repeated keys are made unique.
    expect(items).toHaveLength(15);
    expect(new Set(items.map((i) => i.key)).size).toBe(15);
    const [task, matter, filing] = items;
    expect(task?.fields).toMatchObject({
      titulo: 'Tarea de en',
      responsableId: ID.abogado,
      ladoResponsable: 'EMPIRICA',
      entidadId: null,
      prioridad: null,
    });
    expect(task?.fields).not.toHaveProperty('asuntoId');
    expect(task?.fields).not.toHaveProperty('fechaLimite');
    expect(task?.review).toEqual([]);
    expect(matter?.fields).toMatchObject({ area: null });
    expect(matter?.fields).not.toHaveProperty('fechaObjetivo');
    expect(draftIssues(nth(items, 1))).toEqual(['area']);
    expect(filing?.fields).toMatchObject({ plantillaId: null });
    expect(filing?.source).toBeUndefined();
  });

  it('nothing legal is made up: an obligation of the AI is a draft; the catalog’s comes as the catalog has it', () => {
    const w = createWorld();
    w.google.gemini.reply = () => ({
      explicacion: '',
      elementos: [
        {
          tipo: 'OBLIGACION',
          clave: 'E1',
          titulo: 'Aviso anual',
          categoria: 'FISCAL',
          repetir: 'ANUAL',
          mes: 3,
          diaDelMes: 31,
          autoridad: 'SAT',
        },
        {
          tipo: 'OBLIGACION',
          clave: 'E2',
          titulo: 'Reporte mensual',
          categoria: 'LABORAL_SEGURIDAD_SOCIAL',
          repetir: 'MENSUAL',
          diaDelMes: 17,
        },
        { tipo: 'OBLIGACION', clave: 'E3', titulo: 'Otro nombre', catalogo: '[CATALOGO_1]' },
        {
          tipo: 'TAREA',
          clave: 'E4',
          titulo: 'Presentar escrito',
          fatal: true,
          fecha: '2026-10-20',
        },
        { tipo: 'TRAMITE', clave: 'E5', titulo: 'Licencia', plantilla: '[PLANTILLA_1]' },
        {
          tipo: 'CONTRATO',
          clave: 'E6',
          titulo: '[CONTRAPARTE_1]',
          tipoContrato: '[TIPO_1]',
          fecha: '2027-10-31',
          diasAviso: 30,
        },
      ],
    });
    const { items } = proposal(w, ID.abogado, 'Registra lo de compliance');
    const [byRule31, monthly, fromCatalog, fatal, filing, contract] = items;
    // The 31st is not a day the portal writes a rule for: no rule, no date.
    expect(byRule31?.fields).toMatchObject({
      nombre: `${DRAFT_PREFIX}Aviso anual`,
      categoria: 'FISCAL',
      recurrencia: null,
      autoridad: 'SAT',
      estado: 'ACTIVA',
      visibilidad: 'INTERNO',
    });
    expect(byRule31?.fields).not.toHaveProperty('fundamento');
    expect(byRule31?.fields).not.toHaveProperty('proximoVencimiento');
    expect(byRule31?.review).toEqual(['autoridad']);
    expect(monthly?.fields).toMatchObject({
      nombre: `${DRAFT_PREFIX}Reporte mensual`,
      recurrencia: 'FREQ=MONTHLY;BYMONTHDAY=17',
      proximoVencimiento: '2026-10-17',
    });
    expect(monthly?.review).toEqual(['recurrencia', 'proximoVencimiento']);
    expect(fromCatalog).toMatchObject({
      source: { table: 'CatalogoObligaciones', id: ID.catalogo },
      fields: {
        categoria: 'CORPORATIVO',
        nombre: 'BORRADOR: validar',
        recurrencia: 'FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=12',
        riesgo: 'MEDIO',
        proximoVencimiento: '2027-03-12',
      },
      review: ['proximoVencimiento'],
    });
    expect(fatal).toMatchObject({
      fields: { esFatal: true, fechaLimite: '2026-10-20', estado: 'POR_HACER' },
      review: ['esFatal', 'fechaLimite'],
    });
    expect(filing).toMatchObject({
      source: { table: 'PlantillasTramite', id: ID.plantilla },
      fields: {
        plantillaId: ID.plantilla,
        autoridad: 'Autoridad municipal (ficticia)',
        estado: 'EN_PREPARACION',
      },
    });
    expect(contract).toMatchObject({
      fields: {
        contraparte: 'Proveedor Ficticio, S.A. de C.V.',
        tipo: 'Suministro',
        vigenciaHasta: '2027-10-31',
        diasAvisoPrevio: 30,
        renovacionAutomatica: false,
        responsableId: ID.abogado,
      },
      review: ['diasAvisoPrevio', 'vigenciaHasta'],
    });
    for (const item of items) expect(draftIssues(item)).toEqual([]);
  });

  it('created from the preview, the Bitacora says CREAR_IA; by hand, CREAR', () => {
    const w = createWorld();
    const viaAi = uid(0x80001);
    const byHand = uid(0x80002);
    const fields = {
      clienteId: A,
      titulo: 'Revisión',
      area: 'CONTRATOS',
      estado: 'ACTIVO',
      visibilidad: 'INTERNO',
    };
    expect(
      new Device(w, ID.abogado).push([
        op('Asuntos', 'create', viaAi, fields, { via: 'IA' }),
        op('Asuntos', 'create', byHand, fields),
      ]),
    ).toMatchObject([{ status: 'applied' }, { status: 'applied' }]);
    const log = (id: string): unknown[] =>
      w
        .rows('Bitacora')
        .filter((b) => b.entidadId === id)
        .map((b) => b.accion);
    expect(log(viaAi)).toEqual(['CREAR_IA']);
    expect(log(byHand)).toEqual(['CREAR']);
  });
});

describe('what a person types (D74)', () => {
  it('loses e-mails, long numbers, RFC, CURP and amounts; dates, times and counts stay', () => {
    expect(
      scrub(
        'Escribe a ana.perez@empresa.mx o al +52 (998) 123-4567 antes del 2026-10-15 a las 10:00',
      ),
    ).toBe('Escribe a [CORREO] o al [NUMERO] antes del 2026-10-15 a las 10:00');
    expect(scrub('RFC ABC010203XY9, CURP GODE561231HDFRRN09, cuenta 012180001234567891')).toBe(
      'RFC [RFC], CURP [CURP], cuenta [NUMERO]',
    );
    expect(scrub('Honorarios de $150,000.00 MXN o 20 mil pesos; 3 tareas el 15/10/2026')).toBe(
      'Honorarios de [MONTO] o [MONTO]; 3 tareas el 15/10/2026',
    );
  });

  it('knows a client by every name; a short name only as a word of its own', () => {
    const m = new Masker();
    expect(m.maskAll('CLIENTE', ['Ana', 'Ana Comercial, S.A. de C.V.', 'ACO010101AB1'])).toBe(
      '[CLIENTE_1]',
    );
    expect(m.maskText('ana comercial, s.a. de c.v. y Ana; la semana de ANA')).toBe(
      '[CLIENTE_1] y [CLIENTE_1]; la semana de [CLIENTE_1]',
    );
    expect(m.unmask('[CLIENTE_1]')).toBe('Ana');
  });
});
