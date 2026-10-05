/**
 * The monthly report of a client (F6, PLAN.md § 20): what the firm did in
 * the month and what is coming. It is built only from what a user of the
 * whole client sees (`clientViewRows`), never anything internal, so the PDF
 * can go to the client as it is. Pure: the browser draws the preview and the
 * PDF from it, and the server gives the AI a masked copy of it.
 *
 * Nothing about hours: the retainer is measured by its perimeter.
 */
import { agendaItems, type AgendaItem } from './agenda.ts';
import { periodsOf, currentPeriod, type PeriodState } from './compliance.ts';
import { nextKeyDate, type KeyDateKind } from './contracts.ts';
import { CATEGORIAS_OBLIGACION, type EstadoTarea } from './enums.ts';
import { filingDate, isOpenFiling, stageSince } from './filings.ts';
import { healthIndex, type HealthIndex, type HealthWeights } from './health.ts';
import { daysBetween, taskLight, type Light } from './lights.ts';
import { progressOf } from './progress.ts';
import { addDays, daysInMonth } from './recurrence.ts';
import { parseInstant, toProjectDate } from '../time.ts';
import { text, type Row } from './values.ts';

/** The tabs a report reads. */
export const REPORT_TABLES = [
  'Asuntos',
  'Tareas',
  'Obligaciones',
  'CumplimientosHistorial',
  'Tramites',
  'Contratos',
  'Solicitudes',
  'Eventos',
] as const;
export type ReportTable = (typeof REPORT_TABLES)[number];
export type ReportData = Partial<Record<ReportTable, readonly Row[]>>;

/** Open tasks listed; the rest are counted. */
export const MAX_PENDING_TASKS = 25;
/** "Lo que viene": this many days from the report's date. */
export const UPCOMING_DAYS = 30;
/** Contract dates this close are listed. */
export const CONTRACT_DAYS = 60;

export interface ReportOptions {
  clienteId: string;
  /** "2026-09". */
  periodo: string;
  /** The day it is prepared: lights and "what is coming" count from it. */
  today: string;
  inhabiles: ReadonlySet<string>;
  weights: HealthWeights;
  /** Config.diasEsperaCliente. */
  waitingDays: number;
}

export interface ReportMatter {
  id: string;
  titulo: string;
  area: string | null;
  estado: string | null;
  /** Share of the tasks the client sees that are done, 0 to 100 (null: no tasks). */
  avance: number | null;
  entidadId: string | null;
  /** Concluded within the month. */
  concluido: boolean;
}

export interface ReportTask {
  id: string;
  titulo: string;
  asuntoId: string | null;
  entidadId: string | null;
  /** Closed tasks: the day they were done; open ones: their deadline. */
  fecha: string | null;
  light: Light;
  estado: EstadoTarea | null;
  fatal: boolean;
  /** Whose move it is: EMPIRICA, CLIENTE or AMBOS. */
  lado: string | null;
}

export interface ReportPeriod {
  id: string;
  nombre: string;
  periodo: string;
  vence: string;
  estado: PeriodState;
  /** A period of an earlier month still overdue. */
  atrasado: boolean;
}

export interface ReportCategory {
  categoria: string;
  periodos: ReportPeriod[];
}

export interface ReportFiling {
  id: string;
  titulo: string;
  autoridad: string | null;
  etapa: string | null;
  desde: string | null;
  proxima: string | null;
  estado: string | null;
}

export interface ReportContract {
  id: string;
  contraparte: string;
  tipo: string | null;
  fecha: string;
  kind: KeyDateKind;
}

export interface ReportRequest {
  id: string;
  titulo: string;
  estado: string | null;
  fecha: string;
}

export interface ReportModel {
  clienteId: string;
  periodo: string;
  /** First and last day of the month. */
  from: string;
  to: string;
  today: string;
  health: HealthIndex;
  counts: {
    tareasCerradas: number;
    tareasAbiertas: number;
    vencidas: number;
    porVencer: number;
    enRevision: number;
    asuntosActivos: number;
    periodosCumplidos: number;
    periodosDelMes: number;
  };
  asuntos: ReportMatter[];
  tareasCerradas: ReportTask[];
  tareasPendientes: ReportTask[];
  /** Open tasks not listed (beyond MAX_PENDING_TASKS). */
  pendientesOmitidas: number;
  cumplimiento: ReportCategory[];
  tramites: ReportFiling[];
  contratos: ReportContract[];
  /** Dated items from the report's date to UPCOMING_DAYS ahead. */
  proximos: AgendaItem[];
  solicitudes: ReportRequest[];
}

const MONTHS = {
  es: [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
} as const;

/** "septiembre de 2026" / "September 2026". */
export function periodLabel(periodo: string, lang: 'es' | 'en'): string {
  const [y, m] = periodo.split('-');
  const month = MONTHS[lang][Number(m) - 1] ?? periodo;
  return lang === 'es' ? `${month} de ${y ?? ''}` : `${month} ${y ?? ''}`;
}

/**
 * The day a task was done or a matter concluded: its fechaCierre. Before F6
 * the portal did not record it, so for older records it is the day their
 * state last changed (the field's timestamp), else their last edit.
 */
export function closingDay(row: Row): string | null {
  const recorded = text(row, 'fechaCierre');
  if (recorded) return recorded;
  const stamps = row.fieldTimestamps;
  const stamp =
    stamps && typeof stamps === 'object' && !Array.isArray(stamps) ? stamps.estado : undefined;
  const ms = parseInstant(stamp) ?? parseInstant(row.updatedAt);
  return ms === null ? null : toProjectDate(ms);
}

/** First and last day of "2026-09". */
export function periodBounds(periodo: string): { from: string; to: string } {
  const [y, m] = periodo.split('-').map(Number);
  const year = y ?? 1970;
  const month = m ?? 1;
  const from = `${periodo}-01`;
  return { from, to: `${periodo}-${String(daysInMonth(year, month)).padStart(2, '0')}` };
}

/** The month before the one `today` is in: the report prepared on 2026-10-01 covers "2026-09". */
export function previousPeriod(today: string): string {
  return addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
}

/**
 * One report per client and month, on every device: its id comes from both
 * (a version 8 UUID), so two drafts written offline are the same record and
 * merge on the server field by field.
 */
export function reportId(clienteId: string, periodo: string): string {
  const key = `reporte:${clienteId}:${periodo}`;
  const words = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
      h ^= h >>> 13;
    }
    return h >>> 0;
  });
  const hex = words.map((w) => w.toString(16).padStart(8, '0')).join('');
  const variant = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const live = (rows: readonly Row[] | undefined, clienteId: string): Row[] =>
  (rows ?? []).filter((r) => !r.deleted && r.clienteId === clienteId);

const inMonth = (date: string | null, from: string, to: string): boolean =>
  date !== null && date.slice(0, 10) >= from && date.slice(0, 10) <= to;

const byDate = (a: string | null, b: string | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b);

function taskOf(t: Row, today: string, fecha: string | null): ReportTask {
  return {
    id: t.id,
    titulo: text(t, 'titulo') ?? '',
    asuntoId: text(t, 'asuntoId'),
    entidadId: text(t, 'entidadId'),
    fecha,
    light: taskLight(t, today),
    estado: (text(t, 'estado') as EstadoTarea | null) ?? null,
    fatal: t.esFatal === true,
    lado: text(t, 'ladoResponsable'),
  };
}

/** The report of a month, from rows a user of the whole client sees. */
export function buildReport(data: ReportData, o: ReportOptions): ReportModel {
  const { from, to } = periodBounds(o.periodo);
  const asuntos = live(data.Asuntos, o.clienteId);
  const tareas = live(data.Tareas, o.clienteId);
  const obligaciones = live(data.Obligaciones, o.clienteId);
  const cumplimientos = live(data.CumplimientosHistorial, o.clienteId);
  const tramites = live(data.Tramites, o.clienteId);
  const contratos = live(data.Contratos, o.clienteId);
  const solicitudes = live(data.Solicitudes, o.clienteId);
  const eventos = live(data.Eventos, o.clienteId);

  const health = healthIndex(
    {
      Tareas: tareas,
      Obligaciones: obligaciones,
      CumplimientosHistorial: cumplimientos,
      Tramites: tramites,
    },
    { today: o.today, inhabiles: o.inhabiles, weights: o.weights, waitingDays: o.waitingDays },
  );

  // Matters: the open ones, and those concluded in the month.
  const matters: ReportMatter[] = asuntos
    .filter((a) => a.estado !== 'CONCLUIDO' || inMonth(closingDay(a), from, to))
    .map((a) => ({
      id: a.id,
      titulo: text(a, 'titulo') ?? '',
      area: text(a, 'area'),
      estado: text(a, 'estado'),
      avance: progressOf(tareas.filter((t) => t.asuntoId === a.id)),
      entidadId: text(a, 'entidadId'),
      concluido: a.estado === 'CONCLUIDO',
    }))
    .sort(
      (a, b) =>
        Number(a.concluido) - Number(b.concluido) ||
        (a.area ?? '').localeCompare(b.area ?? '') ||
        a.titulo.localeCompare(b.titulo, 'es'),
    );

  const closed = tareas
    .filter((t) => t.estado === 'HECHO' && inMonth(closingDay(t), from, to))
    .map((t) => taskOf(t, o.today, closingDay(t)))
    .sort((a, b) => byDate(a.fecha, b.fecha));

  const open = tareas
    .filter((t) => t.estado !== 'HECHO')
    .map((t) => taskOf(t, o.today, text(t, 'fechaLimite')))
    .sort((a, b) => byDate(a.fecha, b.fecha) || a.titulo.localeCompare(b.titulo, 'es'));

  // Compliance: the month's periods, and earlier ones still overdue.
  const periods: ReportPeriod[] = [];
  for (const ob of obligaciones) {
    const nombre = text(ob, 'nombre') ?? '';
    for (const p of periodsOf(ob, cumplimientos, from, to, o.today, o.inhabiles)) {
      periods.push({
        id: ob.id,
        nombre,
        periodo: p.periodo,
        vence: p.vence,
        estado: p.estado,
        atrasado: false,
      });
    }
    const current = currentPeriod(ob, cumplimientos, o.today, o.inhabiles);
    if (current && current.periodo < from && current.estado === 'vencido') {
      periods.push({
        id: ob.id,
        nombre,
        periodo: current.periodo,
        vence: current.vence,
        estado: current.estado,
        atrasado: true,
      });
    }
  }
  const categoryOf = new Map(obligaciones.map((ob) => [ob.id, text(ob, 'categoria') ?? 'OTRO']));
  const cumplimiento: ReportCategory[] = [...CATEGORIAS_OBLIGACION]
    .map((categoria) => ({
      categoria,
      periodos: periods
        .filter((p) => categoryOf.get(p.id) === categoria)
        .sort((a, b) => a.vence.localeCompare(b.vence) || a.nombre.localeCompare(b.nombre, 'es')),
    }))
    .filter((c) => c.periodos.length > 0);
  const delMes = periods.filter((p) => !p.atrasado);

  const filings: ReportFiling[] = tramites
    .filter(isOpenFiling)
    .map((f) => ({
      id: f.id,
      titulo: text(f, 'titulo') ?? '',
      autoridad: text(f, 'autoridad'),
      etapa: text(f, 'etapaActual'),
      desde: stageSince(f),
      proxima: filingDate(f),
      estado: text(f, 'estado'),
    }))
    .sort((a, b) => byDate(a.proxima, b.proxima));

  const contracts: ReportContract[] = contratos
    .flatMap((c) => {
      const key = nextKeyDate(c, o.today);
      if (!key || daysBetween(o.today, key.date) > CONTRACT_DAYS) return [];
      return [
        {
          id: c.id,
          contraparte: text(c, 'contraparte') ?? '',
          tipo: text(c, 'tipo'),
          fecha: key.date,
          kind: key.kind,
        },
      ];
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const proximos = agendaItems(
    {
      Tareas: tareas,
      Obligaciones: obligaciones,
      CumplimientosHistorial: cumplimientos,
      Tramites: tramites,
      Contratos: contratos,
      Eventos: eventos,
    },
    { today: o.today, from: o.today, to: addDays(o.today, UPCOMING_DAYS), inhabiles: o.inhabiles },
  );

  const requests: ReportRequest[] = solicitudes
    .filter((s) => inMonth(text(s, 'createdAt'), from, to))
    .map((s) => ({
      id: s.id,
      titulo: text(s, 'titulo') ?? '',
      estado: text(s, 'estado'),
      fecha: (text(s, 'createdAt') ?? '').slice(0, 10),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    clienteId: o.clienteId,
    periodo: o.periodo,
    from,
    to,
    today: o.today,
    health,
    counts: {
      tareasCerradas: closed.length,
      tareasAbiertas: open.length,
      vencidas: open.filter((t) => t.light === 'overdue').length,
      porVencer: open.filter((t) => t.light === 'dueSoon').length,
      enRevision: open.filter((t) => t.light === 'review').length,
      asuntosActivos: matters.filter((m) => !m.concluido).length,
      periodosCumplidos: delMes.filter((p) => p.estado === 'cumplido').length,
      periodosDelMes: delMes.length,
    },
    asuntos: matters,
    tareasCerradas: closed,
    tareasPendientes: open.slice(0, MAX_PENDING_TASKS),
    pendientesOmitidas: Math.max(0, open.length - MAX_PENDING_TASKS),
    cumplimiento,
    tramites: filings,
    contratos: contracts,
    proximos,
    solicitudes: requests,
  };
}
