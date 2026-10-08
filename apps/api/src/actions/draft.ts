/**
 * "Crear con IA" (F8, PLAN.md § 24, D73–D77): a lawyer of a client (its
 * SOCIO_ADMIN or ABOGADO) describes what they need, the AI proposes the
 * records and this turns its answer into the portal's columns. Nothing is
 * written here: the lawyer reviews the proposal and creates it from the
 * device (sync.push, which the Bitacora records as CREAR_IA).
 *
 * What leaves for Google (IA.md): the request without e-mails, long
 * numbers, RFC, CURP or amounts, and with every name the portal knows as a
 * marker; the client's structure as markers (units, people who can be
 * assigned, open matters, the firm's templates and catalog); dates, states
 * and counts. Descriptions, comments and documents never go.
 *
 * Nothing legal is made up (D76): dates only from the request, marked for
 * review; no legal grounds; an obligation from outside the catalog is born
 * "BORRADOR: validar · …"; tasks are born "Por hacer"; everything INTERNO.
 */
import {
  AREAS,
  CATEGORIAS_OBLIGACION,
  ESTADOS_TRAMITE,
  LADOS_RESPONSABLE,
  MAX_DRAFT_ITEMS,
  MAX_DRAFT_TITLE,
  PRIORIDADES,
  RIESGOS,
  addDays,
  canRead,
  dateParts,
  formatRecurrence,
  mayUseAi,
  nextOccurrence,
  parseRecurrence,
  parseStages,
  text,
  toProjectDate,
  toProjectIso,
  userHasClientAccess,
  type AiDraftData,
  type DraftItem,
  type DraftTable,
  type Row,
  type TableName,
  type Value,
} from '@empirica/shared';
import * as z from 'zod/mini';
import { generate } from '../ai/gemini.ts';
import { Masker, scrub } from '../ai/mask.ts';
import { DRAFT_KINDS, draftPrompt, type Lang } from '../ai/prompts.ts';
import type { Session } from '../auth.ts';
import { Database } from '../db/database.ts';
import type { Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import { answerOf, clientNames, langOf, requireOn } from './ai.ts';

/** The most of each list of the client the AI reads. */
const MAX_CONTEXT = 60;
/** A task's checklist from the AI: this many points, this long. */
const MAX_POINTS = 12;
const MAX_POINT = 200;
const MAX_EXPLANATION = 600;
/** How far from today a date the AI read may be. */
const PAST_DAYS = 366;
const FUTURE_DAYS = 3_653;
/** An obligation from outside the catalog, as the catalog's own drafts begin (D76). */
export const DRAFT_PREFIX = 'BORRADOR: validar · ';

const KIND_TABLE: Record<(typeof DRAFT_KINDS)[number], DraftTable> = {
  ASUNTO: 'Asuntos',
  TAREA: 'Tareas',
  TRAMITE: 'Tramites',
  OBLIGACION: 'Obligaciones',
  CONTRATO: 'Contratos',
  CITA: 'Eventos',
};
const tableOfKind = (tipo: string): DraftTable | undefined =>
  (KIND_TABLE as Record<string, DraftTable | undefined>)[tipo.trim().toUpperCase()];

const APPOINTMENT_TYPES = ['CITA', 'REUNION', 'AUDIENCIA'] as const;

const maybe = <T extends z.ZodMiniType>(schema: T) => z.optional(z.nullable(schema));
const RawItemSchema = z.object({
  tipo: z.string(),
  clave: maybe(z.string()),
  titulo: maybe(z.string()),
  asunto: maybe(z.string()),
  dependeDe: maybe(z.string()),
  unidad: maybe(z.string()),
  responsable: maybe(z.string()),
  area: maybe(z.string()),
  prioridad: maybe(z.string()),
  deQuien: maybe(z.string()),
  fecha: maybe(z.string()),
  fechaInicio: maybe(z.string()),
  hora: maybe(z.string()),
  horaFin: maybe(z.string()),
  fatal: maybe(z.boolean()),
  puntos: maybe(z.array(z.string())),
  plantilla: maybe(z.string()),
  catalogo: maybe(z.string()),
  categoria: maybe(z.string()),
  riesgo: maybe(z.string()),
  autoridad: maybe(z.string()),
  repetir: maybe(z.string()),
  cadaCuanto: maybe(z.number()),
  diaDelMes: maybe(z.number()),
  mes: maybe(z.number()),
  tipoContrato: maybe(z.string()),
  renovacionAutomatica: maybe(z.boolean()),
  diasAviso: maybe(z.number()),
  tipoCita: maybe(z.string()),
  estadoTramite: maybe(z.string()),
});
type RawItem = z.infer<typeof RawItemSchema>;

const AnswerSchema = z.object({
  explicacion: z.optional(z.nullable(z.string())),
  elementos: z.array(z.unknown()),
});

/** Markers the AI may use, and what each one stands for in this client. */
interface Known {
  units: Map<string, string>;
  /** People of the firm who can be assigned to this client. */
  firm: Map<string, string>;
  /** People of the client with access to it. */
  client: Map<string, string>;
  matters: Map<string, string>;
  tasks: Map<string, string>;
  templates: Map<string, Row>;
  catalog: Map<string, Row>;
}

interface Conversion {
  clienteId: string;
  /** Who asks: the firm's tasks, matters and contracts are theirs unless the request names someone. */
  me: string;
  today: string;
  /** The unit and the matter chosen on the screen. */
  unit: string | null;
  matter: string | null;
  masker: Masker;
  known: Known;
  /** Keys of the proposal's matters and tasks, which links may name. */
  matterKeys: ReadonlySet<string>;
  taskKeys: ReadonlySet<string>;
  newId: () => string;
}

const WEEKDAYS: Record<Lang, readonly string[]> = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

function weekday(date: string, lang: Lang): string {
  const p = dateParts(date);
  return p ? (WEEKDAYS[lang][new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] ?? '') : '';
}

const pad = (n: number): string => String(n).padStart(2, '0');
/** "-05:00": the firm's offset, as the appointment form writes it. */
const OFFSET = toProjectIso(0).slice(-6);
const at = (date: string, time: string): string => `${date}T${time}:00.000${OFFSET}`;

function oneOf<T extends string>(values: readonly T[], raw: string | null | undefined): T | null {
  const v = (raw ?? '').trim().toUpperCase();
  return (values as readonly string[]).includes(v) ? (v as T) : null;
}

function int(raw: number | null | undefined, min: number, max: number): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max ? raw : null;
}

/** A date the AI read: a real day, not absurdly far from today. */
function dateOf(raw: string | null | undefined, today: string): string | null {
  const v = (raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !dateParts(v)) return null;
  return v >= addDays(today, -PAST_DAYS) && v <= addDays(today, FUTURE_DAYS) ? v : null;
}

/** "9:30" → "09:30"; null if it is not a time of day. */
function timeOf(raw: string | null | undefined): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((raw ?? '').trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h <= 23 && m <= 59 ? `${pad(h)}:${pad(m)}` : null;
}

const hourLater = (time: string): string => {
  const h = Number(time.slice(0, 2)) + 1;
  return h > 23 ? '23:59' : `${pad(h)}:${time.slice(3)}`;
};

/** The AI's text with the names back, on one line, as long as a title may be. */
function textOf(raw: string | null | undefined, masker: Masker, max = MAX_DRAFT_TITLE): string {
  return masker
    .unmask(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** The rule the AI read for an obligation, if it is one the portal writes (recurrence.ts). */
function ruleOf(raw: RawItem): string | null {
  const freq = raw.repetir === 'MENSUAL' ? 'MONTHLY' : raw.repetir === 'ANUAL' ? 'YEARLY' : null;
  if (!freq) return null;
  const interval = int(raw.cadaCuanto, 1, 120) ?? 1;
  const day = raw.diaDelMes === -1 ? -1 : int(raw.diaDelMes, 1, 28);
  if (day === null) return null;
  const month = int(raw.mes, 1, 12);
  if (freq === 'YEARLY' && month === null) return null;
  const rule = formatRecurrence({
    freq,
    interval,
    day,
    ...(freq === 'YEARLY' && month !== null ? { month } : {}),
  });
  return parseRecurrence(rule) ? rule : null;
}

/** The rule's first date from today, if it has one. */
function nextDue(rule: Value | undefined, today: string): string | null {
  const r = parseRecurrence(typeof rule === 'string' ? rule : null);
  return r ? nextOccurrence(r, today, addDays(today, -1)) : null;
}

/** A unique key for each item, the AI's own when it gave a usable one. */
function keysOf(raws: readonly RawItem[]): string[] {
  const taken = new Set<string>();
  return raws.map((raw, i) => {
    const own = (raw.clave ?? '').trim();
    let key = /^[A-Za-z0-9_-]{1,12}$/.test(own) && !taken.has(own) ? own : `E${String(i + 1)}`;
    for (let n = 2; taken.has(key); n++) key = `E${String(i + 1)}_${String(n)}`;
    taken.add(key);
    return key;
  });
}

function convert(raw: RawItem, key: string, c: Conversion): DraftItem | null {
  const table = tableOfKind(raw.tipo);
  if (!table) return null;
  const { known, masker } = c;
  const review: string[] = [];
  const links: DraftItem['links'] = {};
  let source: DraftItem['source'];
  const title = textOf(raw.titulo, masker);
  const fields: Record<string, Value> = {
    clienteId: c.clienteId,
    entidadId: known.units.get(raw.unidad ?? '') ?? c.unit,
    visibilidad: 'INTERNO',
  };
  const date = (value: string | null | undefined, field: string): void => {
    const d = dateOf(value, c.today);
    if (!d) return;
    fields[field] = d;
    review.push(field);
  };
  const authority = (): void => {
    const name = textOf(raw.autoridad, masker);
    if (!name) return;
    fields.autoridad = name;
    review.push('autoridad');
  };
  /** Its matter: one of the proposal, one that exists, or the one chosen on the screen. */
  const matter = (): void => {
    const named = (raw.asunto ?? '').trim();
    if (c.matterKeys.has(named)) {
      links.asuntoId = named;
      return;
    }
    const id = known.matters.get(named) ?? c.matter;
    if (!id) return;
    if (table === 'Eventos') fields.origen = { tipo: 'Asuntos', id };
    else fields.asuntoId = id;
  };
  const firmPerson = known.firm.get(raw.responsable ?? '');

  switch (table) {
    case 'Asuntos':
      Object.assign(fields, {
        titulo: title,
        area: oneOf(AREAS, raw.area),
        estado: 'ACTIVO',
        prioridad: oneOf(PRIORIDADES, raw.prioridad),
        responsableId: firmPerson ?? c.me,
        dentroIguala: true,
      });
      date(raw.fechaInicio, 'fechaInicio');
      date(raw.fecha, 'fechaObjetivo');
      break;

    case 'Tareas': {
      const side = oneOf(LADOS_RESPONSABLE, raw.deQuien) ?? 'EMPIRICA';
      const clientPerson = known.client.get(raw.responsable ?? '');
      const person =
        side === 'EMPIRICA'
          ? firmPerson
          : side === 'CLIENTE'
            ? clientPerson
            : (firmPerson ?? clientPerson);
      const points = (raw.puntos ?? [])
        .map((p) => textOf(p, masker, MAX_POINT))
        .filter(Boolean)
        .slice(0, MAX_POINTS)
        .map((texto) => ({ id: c.newId().slice(0, 8), texto, hecho: false }));
      Object.assign(fields, {
        titulo: title,
        ladoResponsable: side,
        responsableId: person ?? (side === 'EMPIRICA' ? c.me : null),
        estado: 'POR_HACER',
        prioridad: oneOf(PRIORIDADES, raw.prioridad),
        esFatal: raw.fatal === true,
        checklist: points.length ? points : null,
      });
      if (raw.fatal === true) review.push('esFatal');
      date(raw.fecha, 'fechaLimite');
      matter();
      const waits = (raw.dependeDe ?? '').trim();
      if (waits !== key && c.taskKeys.has(waits)) links.dependeDe = waits;
      else if (known.tasks.has(waits)) fields.dependeDe = known.tasks.get(waits) ?? null;
      break;
    }

    case 'Tramites': {
      const template = known.templates.get(raw.plantilla ?? '');
      Object.assign(fields, {
        titulo: title,
        plantillaId: template?.id ?? null,
        estado: oneOf(ESTADOS_TRAMITE, raw.estadoTramite) ?? 'EN_PREPARACION',
      });
      authority();
      if (!fields.autoridad && template) fields.autoridad = text(template, 'autoridad');
      if (template) source = { table: 'PlantillasTramite', id: template.id };
      date(raw.fechaInicio, 'fechaPresentacion');
      date(raw.fecha, 'fechaLimite');
      matter();
      break;
    }

    case 'Obligaciones': {
      const model = known.catalog.get(raw.catalogo ?? '');
      if (model) {
        // The firm's own model: its name, rule and legal basis, as the catalog has them.
        for (const column of [
          'categoria',
          'nombre',
          'fundamento',
          'autoridad',
          'recurrencia',
          'evidenciaRequerida',
          'riesgo',
        ]) {
          fields[column] = model[column] ?? null;
        }
        source = { table: 'CatalogoObligaciones', id: model.id };
      } else {
        const rule = ruleOf(raw);
        Object.assign(fields, {
          categoria: oneOf(CATEGORIAS_OBLIGACION, raw.categoria),
          nombre: title ? `${DRAFT_PREFIX}${title}`.slice(0, MAX_DRAFT_TITLE) : '',
          riesgo: oneOf(RIESGOS, raw.riesgo),
          recurrencia: rule,
        });
        if (rule) review.push('recurrencia');
        authority();
      }
      Object.assign(fields, {
        ladoResponsable: oneOf(LADOS_RESPONSABLE, raw.deQuien),
        estado: 'ACTIVA',
        recorreSiInhabil: true,
      });
      const due = dateOf(raw.fecha, c.today) ?? nextDue(fields.recurrencia, c.today);
      if (due) {
        fields.proximoVencimiento = due;
        review.push('proximoVencimiento');
      }
      break;
    }

    case 'Contratos': {
      const notice = int(raw.diasAviso, 0, 365);
      Object.assign(fields, {
        contraparte: title,
        tipo: textOf(raw.tipoContrato, masker, 120) || null,
        renovacionAutomatica: raw.renovacionAutomatica === true,
        responsableId: firmPerson ?? c.me,
      });
      if (raw.renovacionAutomatica === true) review.push('renovacionAutomatica');
      if (notice !== null) {
        fields.diasAvisoPrevio = notice;
        review.push('diasAvisoPrevio');
      }
      date(raw.fechaInicio, 'fechaFirma');
      date(raw.fecha, 'vigenciaHasta');
      break;
    }

    case 'Eventos': {
      const day = dateOf(raw.fecha, c.today);
      const start = timeOf(raw.hora);
      const end = timeOf(raw.horaFin);
      Object.assign(fields, {
        titulo: title,
        tipo: oneOf(APPOINTMENT_TYPES, raw.tipoCita) ?? 'CITA',
        todoElDia: !start,
      });
      if (day) {
        fields.inicio = at(day, start ?? '00:00');
        fields.fin = start ? at(day, end && end > start ? end : hourLater(start)) : null;
        review.push('inicio');
      }
      matter();
      break;
    }
  }
  return { key, table, fields, links, review, ...(source ? { source } : {}) };
}

/** What the AI answered, as items the browser can show, correct and create. */
export function draftItems(
  elementos: readonly unknown[],
  c: Omit<Conversion, 'matterKeys' | 'taskKeys'>,
): DraftItem[] {
  const raws = elementos
    .flatMap((e) => {
      const parsed = RawItemSchema.safeParse(e);
      return parsed.success && tableOfKind(parsed.data.tipo) ? [parsed.data] : [];
    })
    .slice(0, MAX_DRAFT_ITEMS);
  const keys = keysOf(raws);
  const keysOfKind = (table: DraftTable): Set<string> =>
    new Set(raws.flatMap((raw, i) => (tableOfKind(raw.tipo) === table ? [keys[i] ?? ''] : [])));
  const conversion: Conversion = {
    ...c,
    matterKeys: keysOfKind('Asuntos'),
    taskKeys: keysOfKind('Tareas'),
  };
  return raws.flatMap((raw, i) => {
    const item = convert(raw, keys[i] ?? `E${String(i + 1)}`, conversion);
    return item ? [item] : [];
  });
}

/** Two records with the same name share a marker: it stands for the first. */
function keep<T>(map: Map<string, T>, token: string, value: T): void {
  if (!map.has(token)) map.set(token, value);
}

/** The marker of each record, by id (the reverse of a Known map). */
const reverse = (map: ReadonlyMap<string, string>): Map<string, string> =>
  new Map([...map].map(([token, id]) => [id, token]));

export function aiDraft(
  env: Env,
  session: Session,
  input: {
    clienteId: string;
    peticion: string;
    entidadId?: string | undefined;
    asuntoId?: string | undefined;
  },
): AiDraftData {
  const db = new Database(env);
  const ctx = session.ctx;
  const { clienteId } = input;
  if (!ctx.clients.has(clienteId)) throw new ApiError('NOT_FOUND');
  if (!mayUseAi(ctx, 'draft', clienteId)) throw new ApiError('FORBIDDEN');
  requireOn(db, clienteId);

  const lookup = db.lookup();
  const ofClient = (table: TableName): Row[] =>
    db
      .rows(table)
      .filter((r) => !r.deleted && r.clienteId === clienteId && canRead(ctx, table, r, lookup));
  const units = ofClient('Entidades');
  if (input.entidadId && !units.some((u) => u.id === input.entidadId)) {
    throw new ApiError('NOT_FOUND');
  }
  const matters = ofClient('Asuntos');
  const chosen = input.asuntoId ? matters.find((a) => a.id === input.asuntoId) : undefined;
  if (input.asuntoId && !chosen) throw new ApiError('NOT_FOUND');
  const tasks = ofClient('Tareas');

  // Every name the portal knows becomes a marker: in the request, and in all that is sent.
  const m = new Masker();
  const known: Known = {
    units: new Map(),
    firm: new Map(),
    client: new Map(),
    matters: new Map(),
    tasks: new Map(),
    templates: new Map(),
    catalog: new Map(),
  };
  const cliente = m.maskAll('CLIENTE', clientNames(db, clienteId));
  // Another client named by mistake is masked too.
  for (const id of ctx.clients.keys()) m.maskAll('CLIENTE', clientNames(db, id));
  for (const u of units) {
    const token = m.maskAll('UNIDAD', [text(u, 'nombre'), text(u, 'rfc')]);
    if (token) keep(known.units, token, u.id);
  }
  const usuarios = db.rows('Usuarios');
  const membresias = db.rows('Membresias');
  for (const u of usuarios) {
    if (u.deleted) continue;
    const token = m.mask('PERSONA', text(u, 'nombre'));
    if (!token || u.estado === 'INACTIVO') continue;
    if (!userHasClientAccess(usuarios, membresias, u.id, clienteId)) continue;
    keep(u.lado === 'CLIENTE' ? known.client : known.firm, token, u.id);
  }
  for (const a of matters) {
    const token = m.mask('ASUNTO', text(a, 'titulo'));
    if (token) keep(known.matters, token, a.id);
  }
  for (const t of tasks) {
    const token = m.mask('TAREA', text(t, 'titulo'));
    if (token) keep(known.tasks, token, t.id);
  }
  for (const f of ofClient('Tramites')) {
    m.mask('TRAMITE', text(f, 'titulo'));
    m.mask('AUTORIDAD', text(f, 'autoridad'));
    m.mask('FOLIO', text(f, 'folioExpediente'));
  }
  for (const o of ofClient('Obligaciones')) {
    m.mask('OBLIGACION', text(o, 'nombre'));
    m.mask('AUTORIDAD', text(o, 'autoridad'));
  }
  for (const k of ofClient('Contratos')) {
    m.mask('CONTRAPARTE', text(k, 'contraparte'));
    m.mask('TIPO', text(k, 'tipo'));
  }
  for (const e of ofClient('Eventos')) m.mask('EVENTO', text(e, 'titulo'));
  for (const s of ofClient('Solicitudes')) m.mask('SOLICITUD', text(s, 'titulo'));
  for (const d of ofClient('Documentos')) m.mask('DOCUMENTO', text(d, 'nombre'));
  for (const p of db.rows('PlantillasTramite')) {
    if (p.deleted) continue;
    const token = m.mask('PLANTILLA', text(p, 'nombre'));
    if (token) keep(known.templates, token, p);
    m.mask('AUTORIDAD', text(p, 'autoridad'));
  }
  for (const c of db.rows('CatalogoObligaciones')) {
    if (c.deleted) continue;
    const token = m.mask('CATALOGO', text(c, 'nombre'));
    if (token) keep(known.catalog, token, c);
    m.mask('AUTORIDAD', text(c, 'autoridad'));
  }

  const today = toProjectDate(env.now());
  const lang = langOf(session.user.idioma);
  const unitToken = reverse(known.units);
  const matterToken = reverse(known.matters);
  const taskToken = reverse(known.tasks);
  const roleOf = new Map(usuarios.map((u) => [u.id, text(u, 'rolBase')] as const));
  const context = {
    hoy: today,
    diaDeLaSemana: weekday(today, lang),
    cliente,
    unidadElegida: input.entidadId ? (unitToken.get(input.entidadId) ?? null) : null,
    asuntoElegido: chosen
      ? {
          ref: matterToken.get(chosen.id) ?? null,
          area: text(chosen, 'area'),
          estado: text(chosen, 'estado'),
          tareas: tasks
            .filter((t) => t.asuntoId === chosen.id)
            .slice(0, MAX_CONTEXT)
            .map((t) => ({
              ref: taskToken.get(t.id) ?? null,
              estado: text(t, 'estado'),
              fechaLimite: text(t, 'fechaLimite'),
              deQuienEs: text(t, 'ladoResponsable'),
            })),
        }
      : null,
    unidades: units.slice(0, MAX_CONTEXT).map((u) => ({
      ref: unitToken.get(u.id) ?? null,
      tipo: text(u, 'tipo'),
      perteneceA: unitToken.get(text(u, 'parentId') ?? '') ?? null,
    })),
    personasDelDespacho: [...known.firm]
      .slice(0, MAX_CONTEXT)
      .map(([ref, id]) => ({ ref, rol: roleOf.get(id) ?? null })),
    personasDelCliente: [...known.client.keys()].slice(0, MAX_CONTEXT),
    asuntosAbiertos: matters
      .filter((a) => a.estado !== 'CONCLUIDO')
      .slice(0, MAX_CONTEXT)
      .map((a) => ({
        ref: matterToken.get(a.id) ?? null,
        area: text(a, 'area'),
        estado: text(a, 'estado'),
      })),
    plantillasDeTramite: [...known.templates]
      .slice(0, MAX_CONTEXT)
      .map(([ref, p]) => ({ ref, etapas: parseStages(p.etapas).length })),
    catalogoDeObligaciones: [...known.catalog].slice(0, MAX_CONTEXT).map(([ref, k]) => ({
      ref,
      categoria: text(k, 'categoria'),
      repeticion: text(k, 'recurrencia'),
    })),
  };

  const raw = generate(env, draftPrompt(context, m.maskText(scrub(input.peticion)), lang));
  const answer = answerOf(AnswerSchema, raw);
  return {
    explicacion: textOf(answer.explicacion, m, MAX_EXPLANATION),
    items: draftItems(answer.elementos, {
      clienteId,
      me: session.ctx.userId,
      today,
      unit: input.entidadId ?? null,
      matter: chosen?.id ?? null,
      masker: m,
      known,
      newId: () => env.uuid(),
    }),
  };
}
