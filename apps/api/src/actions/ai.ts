/**
 * The AI helpers (F6, IA.md), online: ai.status; ai.summary (the firm
 * drafts a monthly report's executive summary); ai.ask ("¿qué tengo
 * pendiente?", for anyone, about what they see); ai.reminder (the firm
 * drafts a reminder for the client). The AI only proposes text: a person
 * reads it, changes it and decides. What leaves for Google is masked
 * (ai/mask.ts, ai/prompts.ts).
 */
import {
  REPORT_TABLES,
  RECORD_PATH,
  aiModeOf,
  buildReport,
  canRead,
  clientViewRows,
  currentPeriod,
  daysBetween,
  filingDate,
  isOpenFiling,
  mayUseAi,
  nextKeyDate,
  nonWorkingDays,
  parseHealthWeights,
  taskLight,
  text,
  toProjectDate,
  wholeClientViewer,
  type AiAnswerData,
  type AiStatusData,
  type AiTextData,
  type ModoIA,
  type ReportModel,
  type Row,
  type TableName,
} from '@empirica/shared';
import * as z from 'zod/mini';
import { dailyLimit, generate, geminiKey, usageToday } from '../ai/gemini.ts';
import { Masker, scrub } from '../ai/mask.ts';
import {
  askPrompt,
  reminderPrompt,
  summaryInput,
  summaryPrompt,
  type Lang,
} from '../ai/prompts.ts';
import type { Session } from '../auth.ts';
import { readAgendaSettings } from '../config.ts';
import { Database } from '../db/database.ts';
import type { Env } from '../env.ts';
import { ApiError } from '../errors.ts';

/** A draft longer than this is cut (a summary is a few paragraphs). */
const MAX_TEXT = 2_000;
/** Items "¿qué tengo pendiente?" reads, soonest first. */
const MAX_ASK_ITEMS = 120;

const clip = (value: string): string => value.trim().slice(0, MAX_TEXT);
export const langOf = (value: unknown): Lang => (value === 'en' ? 'en' : 'es');

function configValue(db: Database, clave: string): string | null {
  const row = db.rows('Config').find((r) => !r.deleted && r.clave === clave);
  return row ? text(row, 'valor') : null;
}

export function modeOf(db: Database, clienteId: string): ModoIA {
  return aiModeOf(configValue(db, 'modoIA'), db.table('Clientes').get(clienteId)?.modoIA);
}

export function requireOn(db: Database, clienteId: string): void {
  if (modeOf(db, clienteId) === 'OFF') {
    throw new ApiError('FORBIDDEN', 'La IA está apagada para este cliente.', { reason: 'AI_OFF' });
  }
}

const clientName = (db: Database, clienteId: string): string => {
  const c = db.table('Clientes').get(clienteId);
  return (c ? (text(c, 'nombreComercial') ?? text(c, 'razonSocial')) : null) ?? '';
};

/**
 * Every name a client goes by, the one the portal shows first: any of them
 * in a typed text becomes the client's marker (Masker.maskAll).
 */
export function clientNames(db: Database, clienteId: string): string[] {
  const c = db.table('Clientes').get(clienteId);
  if (!c) return [];
  return [text(c, 'nombreComercial'), text(c, 'razonSocial'), text(c, 'rfc')].filter(
    (n): n is string => Boolean(n),
  );
}

export function answerOf<T>(schema: z.ZodMiniType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError('INTERNAL', 'La IA no pudo responder esta vez. Intenta de nuevo.', {
      reason: 'AI_NO_ANSWER',
    });
  }
  return parsed.data;
}

export function aiStatus(env: Env): AiStatusData {
  const db = new Database(env);
  const usage = usageToday(env);
  return {
    modo: aiModeOf(configValue(db, 'modoIA'), null),
    configurada: Boolean(geminiKey(env)),
    usadasHoy: usage.usadas,
    limiteDiario: dailyLimit(db),
    agotada: usage.agotada,
  };
}

/** A client's month as the report shows it: only what a user of the whole client sees. */
export function serverReport(
  env: Env,
  db: Database,
  clienteId: string,
  periodo: string,
): ReportModel {
  const data = Object.fromEntries(REPORT_TABLES.map((t) => [t, db.rows(t)]));
  const visible = clientViewRows(data, clienteId, db.lookup());
  return buildReport(visible, {
    clienteId,
    periodo,
    today: toProjectDate(env.now()),
    inhabiles: nonWorkingDays(db.rows('DiasInhabiles')),
    weights: parseHealthWeights(configValue(db, 'pesosSalud')),
    waitingDays: readAgendaSettings(db.rows('Config')).waitingDays,
  });
}

export function aiSummary(
  env: Env,
  session: Session,
  input: { clienteId: string; periodo: string; idioma?: 'es' | 'en' | undefined },
): AiTextData {
  const db = new Database(env);
  if (!session.ctx.clients.has(input.clienteId)) throw new ApiError('NOT_FOUND');
  if (!mayUseAi(session.ctx, 'summary', input.clienteId)) throw new ApiError('FORBIDDEN');
  requireOn(db, input.clienteId);
  const report = serverReport(env, db, input.clienteId, input.periodo);
  const lang = input.idioma ?? langOf(db.table('Clientes').get(input.clienteId)?.idioma);
  const masker = new Masker();
  const raw = generate(
    env,
    summaryPrompt(summaryInput(report, clientName(db, input.clienteId), masker), lang),
  );
  const { resumen } = answerOf(z.object({ resumen: z.string() }), raw);
  return { texto: clip(masker.unmask(resumen)) };
}

interface Ref {
  table: TableName;
  id: string;
  titulo: string;
}

export function aiAsk(
  env: Env,
  session: Session,
  input: { pregunta: string; clienteId?: string | undefined },
): AiAnswerData {
  const db = new Database(env);
  const ctx = session.ctx;
  if (input.clienteId && !ctx.clients.has(input.clienteId)) throw new ApiError('NOT_FOUND');
  const clients = (input.clienteId ? [input.clienteId] : [...ctx.clients.keys()]).filter(
    (id) => mayUseAi(ctx, 'ask', id) && modeOf(db, id) !== 'OFF',
  );
  if (!clients.length) {
    throw new ApiError('FORBIDDEN', 'La IA está apagada.', { reason: 'AI_OFF' });
  }
  const lookup = db.lookup();
  const today = toProjectDate(env.now());
  const inhabiles = nonWorkingDays(db.rows('DiasInhabiles'));
  const masker = new Masker();
  const refs = new Map<string, Ref>();
  const several = clients.length > 1;
  const visible = (table: TableName): Row[] =>
    db
      .rows(table)
      .filter(
        (r) =>
          !r.deleted &&
          clients.includes(text(r, 'clienteId') ?? '') &&
          canRead(ctx, table, r, lookup),
      );
  const names = new Map(db.rows('Usuarios').map((u) => [u.id, text(u, 'nombre')] as const));
  const units = new Map(db.rows('Entidades').map((e) => [e.id, text(e, 'nombre')] as const));
  const matters = new Map(db.rows('Asuntos').map((a) => [a.id, text(a, 'titulo')] as const));
  const ref = (kind: string, table: TableName, row: Row, titulo: string | null): string | null => {
    const token = masker.mask(kind, titulo);
    if (token) refs.set(token, { table, id: row.id, titulo: titulo ?? '' });
    return token;
  };
  const whose = (row: Row) => ({
    ...(several
      ? { cliente: masker.mask('CLIENTE', clientName(db, text(row, 'clienteId') ?? '')) }
      : {}),
    unidad: masker.mask('UNIDAD', units.get(text(row, 'entidadId') ?? '') ?? null),
  });
  // Every client's names are known to the masker, so a question naming one is masked.
  for (const id of clients) masker.maskAll('CLIENTE', clientNames(db, id));

  const items: { fecha: string | null; item: Record<string, unknown> }[] = [];
  for (const t of visible('Tareas')) {
    if (t.estado === 'HECHO') continue;
    items.push({
      fecha: text(t, 'fechaLimite'),
      item: {
        tipo: 'tarea',
        ref: ref('TAREA', 'Tareas', t, text(t, 'titulo')),
        asunto: masker.mask('ASUNTO', matters.get(text(t, 'asuntoId') ?? '') ?? null),
        responsable: masker.mask('PERSONA', names.get(text(t, 'responsableId') ?? '') ?? null),
        fechaLimite: text(t, 'fechaLimite'),
        semaforo: taskLight(t, today),
        estado: text(t, 'estado'),
        deQuienEs: text(t, 'ladoResponsable'),
        fatal: t.esFatal === true,
        ...whose(t),
      },
    });
  }
  const cumplimientos = visible('CumplimientosHistorial');
  for (const ob of visible('Obligaciones')) {
    const p = currentPeriod(ob, cumplimientos, today, inhabiles);
    if (!p) continue;
    items.push({
      fecha: p.vence,
      item: {
        tipo: 'obligacion',
        ref: ref('OBLIGACION', 'Obligaciones', ob, text(ob, 'nombre')),
        categoria: text(ob, 'categoria'),
        vence: p.vence,
        estado: p.estado,
        ...whose(ob),
      },
    });
  }
  for (const f of visible('Tramites')) {
    if (!isOpenFiling(f)) continue;
    items.push({
      fecha: filingDate(f),
      item: {
        tipo: 'tramite',
        ref: ref('TRAMITE', 'Tramites', f, text(f, 'titulo')),
        etapa: masker.mask('ETAPA', text(f, 'etapaActual')),
        proximaFecha: filingDate(f),
        estado: text(f, 'estado'),
        ...whose(f),
      },
    });
  }
  for (const c of visible('Contratos')) {
    const key = nextKeyDate(c, today);
    if (!key || daysBetween(today, key.date) > 90) continue;
    items.push({
      fecha: key.date,
      item: {
        tipo: 'contrato',
        ref: ref('CONTRAPARTE', 'Contratos', c, text(c, 'contraparte')),
        fecha: key.date,
        clase: key.kind,
        ...whose(c),
      },
    });
  }
  for (const e of visible('Eventos')) {
    const day = (text(e, 'inicio') ?? '').slice(0, 10);
    if (!day || day < today || daysBetween(today, day) > 60) continue;
    items.push({
      fecha: day,
      item: {
        tipo: 'cita',
        ref: ref('EVENTO', 'Eventos', e, text(e, 'titulo')),
        fecha: day,
        clase: text(e, 'tipo'),
        ...whose(e),
      },
    });
  }
  items.sort((a, b) =>
    a.fecha === b.fecha
      ? 0
      : a.fecha === null
        ? 1
        : b.fecha === null
          ? -1
          : a.fecha.localeCompare(b.fecha),
  );

  const lang = langOf(session.user.idioma);
  const raw = generate(
    env,
    askPrompt(
      items.slice(0, MAX_ASK_ITEMS).map((i) => i.item),
      masker.maskText(scrub(input.pregunta)),
      lang,
      today,
    ),
  );
  const answer = answerOf(
    z.object({ respuesta: z.string(), referencias: z.optional(z.array(z.string())) }),
    raw,
  );
  const enlaces = [...new Set(answer.referencias ?? [])].flatMap((token) => {
    const r = refs.get(token);
    if (!r || !(r.table in RECORD_PATH)) return [];
    return [
      { titulo: r.titulo, ruta: `${RECORD_PATH[r.table as keyof typeof RECORD_PATH]}/${r.id}` },
    ];
  });
  return { respuesta: clip(masker.unmask(answer.respuesta)), enlaces };
}

export function aiReminder(env: Env, session: Session, input: { tareaId: string }): AiTextData {
  const db = new Database(env);
  const task = db.table('Tareas').get(input.tareaId);
  if (!task || task.deleted || !canRead(session.ctx, 'Tareas', task, db.lookup())) {
    throw new ApiError('NOT_FOUND');
  }
  const clienteId = text(task, 'clienteId') ?? '';
  if (!mayUseAi(session.ctx, 'reminder', clienteId)) throw new ApiError('FORBIDDEN');
  requireOn(db, clienteId);
  // A reminder is about what the client sees and has to do.
  if (!canRead(wholeClientViewer(clienteId), 'Tareas', task, db.lookup())) {
    throw new ApiError('FORBIDDEN', 'El cliente no ve esta tarea: es interna.', {
      reason: 'INTERNAL_TASK',
    });
  }
  if (task.estado === 'HECHO' || task.ladoResponsable === 'EMPIRICA') {
    throw new ApiError('VALIDATION', 'Esta tarea no espera nada del cliente.', {
      reason: 'NOT_CLIENT_SIDE',
    });
  }
  const today = toProjectDate(env.now());
  const since = text(task, 'enEsperaDesde');
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const pendientes = checklist.filter(
    (c) => c && typeof c === 'object' && !Array.isArray(c) && c.hecho !== true,
  ).length;
  const masker = new Masker();
  const asunto = db.table('Asuntos').get(text(task, 'asuntoId') ?? '');
  const raw = generate(
    env,
    reminderPrompt(
      {
        tarea: masker.mask('TAREA', text(task, 'titulo')),
        asunto: asunto ? masker.mask('ASUNTO', text(asunto, 'titulo')) : null,
        cliente: masker.mask('CLIENTE', clientName(db, clienteId)),
        fechaLimite: text(task, 'fechaLimite'),
        estado: text(task, 'estado'),
        diasEnEspera: since ? Math.max(0, daysBetween(since, today)) : null,
        puntosPendientes: pendientes,
        puntosTotales: checklist.length,
      },
      langOf(db.table('Clientes').get(clienteId)?.idioma),
    ),
  );
  const { texto } = answerOf(z.object({ texto: z.string() }), raw);
  return { texto: clip(masker.unmask(texto)) };
}
