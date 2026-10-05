/**
 * Phase 6: the AI helpers (IA.md). Google reads structure and markers, never
 * a name; the person gets the names back. The firm drafts summaries and
 * reminders, anyone asks about what they see, a client in OFF has none. The
 * model is chosen by the portal, and Google's limits are waited out.
 */
import {
  text,
  type AiAnswerData,
  type AiStatusData,
  type AiTextData,
  type ApiFailure,
  type TableName,
} from '@empirica/shared';
import { ID } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { chooseModel } from './ai/gemini.ts';
import { PROP } from './env.ts';
import { checkGemini, type SetupReport } from './setup.ts';
import { createWorld, type World } from './testing/harness.ts';

const A = ID.clienteA;
const MARKER = /\[[A-Z]+_\d+\]/g;

const failure = (res: unknown): ApiFailure['error'] => {
  const r = res as ApiFailure;
  expect(r.ok).toBe(false);
  return r.error;
};

const summary = (w: World, as: string, clienteId: string = A) =>
  w.call<AiTextData>('ai.summary', { clienteId, periodo: '2026-09' }, { as });

const ask = (w: World, as: string, pregunta = '¿Qué tengo pendiente?', clienteId?: string) =>
  w.call<AiAnswerData>('ai.ask', { pregunta, ...(clienteId ? { clienteId } : {}) }, { as });

const reminder = (w: World, as: string, tareaId: string) =>
  w.call<AiTextData>('ai.reminder', { tareaId }, { as });

/** Every name the portal holds: none may reach Google. */
function namesIn(w: World): string[] {
  const fields: [TableName, string[]][] = [
    ['Clientes', ['razonSocial', 'nombreComercial']],
    ['Entidades', ['nombre']],
    ['Usuarios', ['nombre', 'email']],
    ['Asuntos', ['titulo']],
    ['Tareas', ['titulo']],
    ['Obligaciones', ['nombre', 'autoridad']],
    ['Tramites', ['titulo', 'autoridad', 'etapaActual']],
    ['Contratos', ['contraparte']],
    ['Eventos', ['titulo']],
    ['Solicitudes', ['titulo']],
    ['Documentos', ['nombre']],
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
  for (const call of w.google.gemini.calls) {
    for (const name of names) {
      expect(call.prompt, name).not.toContain(name);
      expect(call.system, name).not.toContain(name);
    }
  }
}

/** The model answers with every marker it was given: the test sees all that was sent. */
function echoMarkers(w: World): void {
  w.google.gemini.reply = (call) => {
    const refs = [...new Set(call.prompt.match(MARKER) ?? [])];
    return { respuesta: refs.join(' | '), referencias: refs };
  };
}

describe('what leaves for Google', () => {
  it('the month’s summary: markers in place of every name; the lawyer reads the names back', () => {
    const w = createWorld();
    const res = summary(w, ID.abogado);
    if (!res.ok) throw new Error(res.error.message);
    expect(w.google.gemini.calls).toHaveLength(1);
    expectNoNames(w);
    expect(res.data.texto).not.toMatch(MARKER);
    // The demo answer names the first matter it was given, now with its title.
    expect(res.data.texto).toMatch(
      /Asamblea anual|Licencia de funcionamiento|Contrato de arrendamiento/,
    );
    // What was sent is the client's view: nothing internal is even counted as a marker.
    const [call] = w.google.gemini.calls;
    expect(call?.schemaKeys).toEqual(['resumen']);
    expect(call?.system).toContain('No inventes hechos, fechas, plazos');
    expect(call?.system).toContain('No hables de horas');
  });

  it('a question is masked with every name the portal knows', () => {
    const w = createWorld();
    const res = ask(w, ID.cAdmin, '¿Qué falta de Entregar acta constitutiva para Cliente Demo?');
    if (!res.ok) throw new Error(res.error.message);
    const [call] = w.google.gemini.calls;
    expect(call?.prompt).toContain('¿Qué falta de [TAREA_');
    expectNoNames(w);
  });

  it('the answer is about what the person sees, with links to it', () => {
    const w = createWorld();
    echoMarkers(w);
    const res = ask(w, ID.cColab);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.respuesta).toContain('Entregar acta constitutiva');
    for (const hidden of ['Revisar criterio', 'Reunir pruebas', 'Enviar logotipo']) {
      expect(res.data.respuesta).not.toContain(hidden);
    }
    expect(res.data.enlaces).toContainEqual({
      titulo: 'Entregar acta constitutiva',
      ruta: `/tareas/${ID.tNorte1}`,
    });
    expectNoNames(w);
  });

  it('a reminder for the client: the task and its matter as markers, the text with their names', () => {
    const w = createWorld();
    const res = reminder(w, ID.abogado, ID.tNorte1);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.texto).toContain('Entregar acta constitutiva');
    expect(res.data.texto).not.toMatch(MARKER);
    const prompt = JSON.parse(w.google.gemini.calls[0]?.prompt ?? '{}') as Record<string, unknown>;
    expect(prompt).toMatchObject({
      tarea: '[TAREA_1]',
      asunto: '[ASUNTO_1]',
      cliente: '[CLIENTE_1]',
      fechaLimite: '2026-10-15',
      puntosPendientes: 2,
      puntosTotales: 2,
    });
    expectNoNames(w);
  });
});

describe('who uses which helper', () => {
  it('the firm drafts; the client asks; another client is not there', () => {
    const w = createWorld();
    expect(summary(w, ID.asistente).ok).toBe(true);
    expect(failure(summary(w, ID.cAdmin)).code).toBe('FORBIDDEN');
    expect(failure(summary(w, ID.abogadoB)).code).toBe('NOT_FOUND');
    expect(failure(reminder(w, ID.cAdmin, ID.tNorte1)).code).toBe('FORBIDDEN');
    expect(failure(ask(w, ID.cB, '¿Qué tengo pendiente?', A)).code).toBe('NOT_FOUND');
    expect(ask(w, ID.cLectura).ok).toBe(true);
  });

  it('a reminder only for what the client sees and has to do', () => {
    const w = createWorld();
    for (const internal of [ID.tInterna, ID.tBajoInterno]) {
      expect(failure(reminder(w, ID.abogado, internal))).toMatchObject({
        code: 'FORBIDDEN',
        details: { reason: 'INTERNAL_TASK' },
      });
    }
    expect(failure(reminder(w, ID.abogado, ID.tDespacho))).toMatchObject({
      code: 'VALIDATION',
      details: { reason: 'NOT_CLIENT_SIDE' },
    });
    expect(w.google.gemini.calls).toHaveLength(0);
  });

  it('with the AI off for a client, nothing about it goes to Google', () => {
    const w = createWorld();
    w.edit('Clientes', A, { modoIA: 'OFF' });
    expect(failure(summary(w, ID.abogado))).toMatchObject({
      code: 'FORBIDDEN',
      details: { reason: 'AI_OFF' },
    });
    expect(failure(reminder(w, ID.abogado, ID.tNorte1)).details).toMatchObject({
      reason: 'AI_OFF',
    });
    expect(failure(ask(w, ID.cAdmin)).details).toMatchObject({ reason: 'AI_OFF' });
    // The firm still asks about its other clients, and only about them.
    echoMarkers(w);
    const res = ask(w, ID.socio);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.respuesta).toContain('Enviar logotipo');
    expect(res.data.respuesta).not.toContain('Entregar acta constitutiva');
  });
});

describe('the model and Google’s limits', () => {
  it('picks the newest stable Flash-Lite, keeps it, and does not ask again', () => {
    expect(
      chooseModel([
        { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
        {
          name: 'models/gemini-4.0-flash-lite-preview',
          supportedGenerationMethods: ['generateContent'],
        },
        { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] },
      ]),
    ).toBe('gemini-3.5-flash-lite');
    expect(chooseModel([{ name: 'models/gemini-3.8-flash' }])).toBeNull();

    const w = createWorld();
    expect(summary(w, ID.abogado).ok).toBe(true);
    expect(summary(w, ID.abogado).ok).toBe(true);
    expect(w.google.gemini.listCalls).toBe(1);
    expect(w.google.gemini.calls.map((c) => c.model)).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash-lite',
    ]);
    const config = w.rows('Config').find((c) => c.clave === 'modeloIA');
    expect(config?.valor).toBe('gemini-3.5-flash-lite');
    expect(w.rows('Notificaciones').some((n) => n.tipo === 'IA_MODELO')).toBe(false);
  });

  it('a model Google retired: another one, kept, and the partners hear it', () => {
    const w = createWorld();
    const config = w.rows('Config').find((c) => c.clave === 'modeloIA');
    w.edit('Config', config?.id ?? '', { valor: 'gemini-2.0-flash-lite' });
    const res = summary(w, ID.abogado);
    if (!res.ok) throw new Error(res.error.message);
    expect(w.row('Config', config?.id ?? '')?.valor).toBe('gemini-3.5-flash-lite');
    expect(
      w
        .rows('Notificaciones')
        .filter((n) => n.tipo === 'IA_MODELO')
        .map((n) => [n.usuarioId, n.mensaje]),
    ).toEqual([[ID.socio, 'gemini-3.5-flash-lite']]);
  });

  it('a per-minute limit: one more try after a pause; twice, try in a minute', () => {
    const w = createWorld();
    w.google.gemini.failNext = ['minute'];
    expect(summary(w, ID.abogado).ok).toBe(true);
    expect(w.google.sleeps).toEqual([2000]);
    w.google.gemini.failNext = ['minute', 'minute'];
    expect(failure(summary(w, ID.abogado)).code).toBe('RATE_LIMITED');
  });

  it('the day’s quota: the partners hear it once, nobody calls Google until California’s midnight', () => {
    const w = createWorld();
    expect(summary(w, ID.abogado).ok).toBe(true);
    w.google.gemini.failNext = ['day'];
    expect(failure(summary(w, ID.abogado))).toMatchObject({
      code: 'QUOTA_EXHAUSTED',
      details: { reason: 'AI_QUOTA' },
    });
    const calls = w.google.gemini.calls.length;
    expect(failure(ask(w, ID.cAdmin)).code).toBe('QUOTA_EXHAUSTED');
    expect(w.google.gemini.calls).toHaveLength(calls);
    expect(
      w
        .rows('Notificaciones')
        .filter((n) => n.tipo === 'IA_CUOTA')
        .map((n) => [n.usuarioId, n.mensaje]),
    ).toEqual([[ID.socio, '1']]);
    expect(w.ok<AiStatusData>('ai.status', {}, { as: ID.socio })).toMatchObject({
      configurada: true,
      usadasHoy: 1,
      agotada: true,
      modo: 'METADATA_ONLY',
    });

    // 12:00 in Cancún is 10:00 in California; at 2:00 in Cancún the next day it is midnight there.
    w.clock.set('2026-10-03T02:00:00.000-05:00');
    expect(summary(w, ID.abogado).ok).toBe(true);
    expect(w.ok<AiStatusData>('ai.status', {}, { as: ID.socio })).toMatchObject({
      usadasHoy: 1,
      agotada: false,
    });
  });

  it('without a key the portal works and says the AI is not configured; a wrong key says so', () => {
    const w = createWorld();
    w.google.props.delete(PROP.geminiKey);
    expect(failure(summary(w, ID.abogado))).toMatchObject({
      code: 'NOT_IMPLEMENTED',
      details: { reason: 'AI_NO_KEY' },
    });
    expect(w.ok<AiStatusData>('ai.status', {}, { as: ID.abogado }).configurada).toBe(false);

    w.google.props.set(PROP.geminiKey, 'una-clave-equivocada');
    expect(failure(summary(w, ID.abogado))).toMatchObject({
      code: 'NOT_IMPLEMENTED',
      details: { reason: 'AI_BAD_KEY' },
    });
  });

  it('setup tries the key and names the model, without writing the key anywhere', () => {
    const w = createWorld();
    expect(w.setupReport.checked).toContain(
      'Gemini: la clave funciona; el portal usará gemini-3.5-flash-lite.',
    );
    const report = (): SetupReport => ({
      spreadsheetId: '',
      created: [],
      checked: [],
      warnings: [],
    });

    const wrong = report();
    w.google.props.set(PROP.geminiKey, 'una-clave-equivocada');
    checkGemini(w.env, wrong);
    expect(wrong.warnings.join(' ')).toContain('GEMINI_API_KEY no funciona (Google respondió 400)');
    expect(JSON.stringify(wrong)).not.toContain('una-clave-equivocada');

    const none = report();
    w.google.props.delete(PROP.geminiKey);
    checkGemini(w.env, none);
    expect(none.warnings.join(' ')).toContain('Falta GEMINI_API_KEY');
  });
});
