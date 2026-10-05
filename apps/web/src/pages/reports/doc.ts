/**
 * The monthly report as a document (F6): numbered sections of paragraphs and
 * tables, every word in the report's language. The preview on screen and the
 * PDF are both drawn from this, so what the lawyer reviews is what the client
 * receives. Sections with nothing to say are left out; the summary, the
 * health index and the numbers always go.
 */
import type { TFunction } from 'i18next';
import {
  AREAS,
  CATEGORIAS_OBLIGACION,
  ESTADOS_ASUNTO,
  ESTADOS_SOLICITUD,
  ESTADOS_TRAMITE,
  LADOS_RESPONSABLE,
  UPCOMING_DAYS,
  periodLabel,
  type AgendaItem,
  type HealthBand,
  type ReportModel,
} from '@empirica/shared';
import type { Messages } from '../../i18n/types.ts';
import { oneOf } from '../../i18n/labels.ts';

export type ReportLang = 'es' | 'en';

export interface DocCell {
  text: string;
  /** A second, smaller line: the unit, the authority, "plazo fatal". */
  note?: string;
}

export interface DocTable {
  columns: { label: string; align?: 'right' }[];
  /** Which column takes the free width (the name); the rest fit their content. */
  wide: number;
  rows: DocCell[][];
}

export interface DocSection {
  key: string;
  /** "2. Índice de salud". */
  title: string;
  paragraphs: string[];
  score?: { value: number; label: string; band: HealthBand };
  table?: DocTable;
  /** Tables with their own small heading (compliance, by category). */
  groups?: { title: string; table: DocTable }[];
  note?: string;
}

export interface ReportDoc {
  lang: ReportLang;
  title: string;
  /** "septiembre de 2026 · Cliente Demo, S.A. de C.V." (shown in small capitals). */
  subtitle: string;
  subjectLabel: string;
  subject: string;
  cutoff: string;
  sections: DocSection[];
  closing: string;
  signer: { name: string; role: string; firm: string };
  site: string;
  /** "Página {{page}} de {{pages}}" with the numbers in place. */
  pageLabel: (page: number, pages: number) => string;
}

export interface ReportDocInput {
  model: ReportModel;
  /** The translation of the report's language (i18n.getFixedT). */
  t: TFunction;
  lang: ReportLang;
  /** The client's legal name. */
  client: string;
  /** The client's units, by id: a row says which unit it is about. */
  units: ReadonlyMap<string, string>;
  summary: string | null;
  signer: string;
}

const TAG: Record<ReportLang, string> = { es: 'es-MX', en: 'en-US' };

/** "15 oct 2026" in the report's language. */
export function docDate(date: string | null, lang: ReportLang): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return '—';
  return new Intl.DateTimeFormat(TAG[lang], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

/** "5 de octubre de 2026" in the report's language. */
function longDate(date: string, lang: ReportLang): string {
  return new Intl.DateTimeFormat(TAG[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

const cell = (text: string, note?: string | null): DocCell => (note ? { text, note } : { text });

const EVENT_TYPES = ['CITA', 'REUNION', 'AUDIENCIA'] as const;

/** "Tarea", "Obligación"… or, for an appointment, its type. */
function kindOf(t: TFunction, table: AgendaItem['table'], tipo: AgendaItem['tipo']): string {
  if (table !== 'Eventos') return t(`dashboard.kinds.${table}`);
  return oneOf(EVENT_TYPES, tipo) ? t(`agenda.types.${tipo}`) : '';
}

export function reportDoc(input: ReportDocInput): ReportDoc {
  const { model, t, lang } = input;
  const c = (key: keyof Messages['reportPdf']['columns']): string => t(`reportPdf.columns.${key}`);
  const date = (d: string | null): string => docDate(d, lang);
  const period = periodLabel(model.periodo, lang);
  const matterTitle = new Map(model.asuntos.map((a) => [a.id, a.titulo]));
  const unit = (id: string | null): string | null => (id ? (input.units.get(id) ?? null) : null);
  const several = input.units.size > 0;

  const sections: Omit<DocSection, 'title'>[] = [];
  const titles: string[] = [];
  const add = (title: string, section: Omit<DocSection, 'title'>): void => {
    titles.push(title);
    sections.push(section);
  };

  const summary = (input.summary ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  add(t('reportPdf.sections.summary'), {
    key: 'summary',
    paragraphs: summary.length ? summary : [t('reportPdf.noSummary')],
  });

  const h = model.health;
  add(t('reportPdf.sections.health'), {
    key: 'health',
    paragraphs: [t('reportPdf.healthHint')],
    score: {
      value: h.score,
      label: `${t('reportPdf.healthScore', { score: h.score })} · ${t(`health.bands.${h.band}`)}`,
      band: h.band,
    },
    table: {
      columns: [
        { label: c('factor') },
        { label: c('count'), align: 'right' },
        { label: c('points'), align: 'right' },
      ],
      wide: 0,
      rows: h.parts.map((p) => [
        cell(t(`health.factors.${p.factor}`)),
        cell(String(p.count)),
        cell(p.points ? `−${String(p.points)}` : '0'),
      ]),
    },
  });

  const n = model.counts;
  add(t('reportPdf.sections.numbers'), {
    key: 'numbers',
    paragraphs: [],
    table: {
      columns: [{ label: c('indicator') }, { label: c('value'), align: 'right' }],
      wide: 0,
      rows: [
        [cell(t('reportPdf.numbers.closed')), cell(String(n.tareasCerradas))],
        [cell(t('reportPdf.numbers.open')), cell(String(n.tareasAbiertas))],
        [cell(t('reportPdf.numbers.overdue')), cell(String(n.vencidas))],
        [cell(t('reportPdf.numbers.dueSoon')), cell(String(n.porVencer))],
        [cell(t('reportPdf.numbers.review')), cell(String(n.enRevision))],
        [cell(t('reportPdf.numbers.matters')), cell(String(n.asuntosActivos))],
        ...(n.periodosDelMes
          ? [
              [
                cell(t('reportPdf.numbers.periods')),
                cell(
                  t('reportPdf.numbers.periodsValue', {
                    done: n.periodosCumplidos,
                    total: n.periodosDelMes,
                  }),
                ),
              ],
            ]
          : []),
      ],
    },
  });

  if (model.asuntos.length) {
    add(t('reportPdf.sections.matters'), {
      key: 'matters',
      paragraphs: [],
      table: {
        columns: [
          { label: c('matter') },
          { label: c('area') },
          { label: c('state') },
          { label: c('progress'), align: 'right' },
        ],
        wide: 0,
        rows: model.asuntos.map((a) => [
          cell(a.titulo, several ? unit(a.entidadId) : null),
          cell(oneOf(AREAS, a.area) ? t(`options.areas.${a.area}`) : ''),
          cell(
            a.concluido
              ? t('reportPdf.concluded')
              : oneOf(ESTADOS_ASUNTO, a.estado)
                ? t(`matters.estados.${a.estado}`)
                : '',
          ),
          cell(a.avance === null ? '—' : `${String(a.avance)} %`),
        ]),
      },
    });
  }

  if (model.tareasCerradas.length) {
    add(t('reportPdf.sections.closed'), {
      key: 'closed',
      paragraphs: [],
      table: {
        columns: [{ label: c('task') }, { label: c('matter') }, { label: c('date') }],
        wide: 0,
        rows: model.tareasCerradas.map((x) => [
          cell(x.titulo, several ? unit(x.entidadId) : null),
          cell(x.asuntoId ? (matterTitle.get(x.asuntoId) ?? '') : ''),
          cell(date(x.fecha)),
        ]),
      },
    });
  }

  if (model.tareasPendientes.length) {
    add(t('reportPdf.sections.pending'), {
      key: 'pending',
      paragraphs: [],
      table: {
        columns: [
          { label: c('task') },
          { label: c('whose') },
          { label: c('due') },
          { label: c('light') },
        ],
        wide: 0,
        rows: model.tareasPendientes.map((x) => [
          cell(
            x.titulo,
            [x.asuntoId ? matterTitle.get(x.asuntoId) : null, several ? unit(x.entidadId) : null]
              .filter(Boolean)
              .join(' · ') || null,
          ),
          cell(oneOf(LADOS_RESPONSABLE, x.lado) ? t(`tasks.lados.${x.lado}`) : ''),
          cell(date(x.fecha), x.fatal ? t('reportPdf.fatal') : null),
          cell(t(`semaforo.${x.light}`)),
        ]),
      },
      ...(model.pendientesOmitidas
        ? { note: t('reportPdf.more', { count: model.pendientesOmitidas }) }
        : {}),
    });
  }

  if (model.cumplimiento.length) {
    add(t('reportPdf.sections.compliance'), {
      key: 'compliance',
      paragraphs: [],
      groups: model.cumplimiento.map((g) => ({
        title: oneOf(CATEGORIAS_OBLIGACION, g.categoria)
          ? t(`options.categorias.${g.categoria}`)
          : g.categoria,
        table: {
          columns: [{ label: c('obligation') }, { label: c('dueOn') }, { label: c('state') }],
          wide: 0,
          rows: g.periodos.map((p) => [
            cell(p.nombre),
            cell(date(p.vence), p.atrasado ? t('reportPdf.earlier') : null),
            cell(t(`compliance.states.${p.estado}`)),
          ]),
        },
      })),
    });
  }

  if (model.tramites.length) {
    add(t('reportPdf.sections.filings'), {
      key: 'filings',
      paragraphs: [],
      table: {
        columns: [
          { label: c('filing') },
          { label: c('stage') },
          { label: c('since') },
          { label: c('next') },
        ],
        wide: 0,
        rows: model.tramites.map((f) => [
          cell(f.titulo, f.autoridad),
          cell(
            f.etapa ?? (oneOf(ESTADOS_TRAMITE, f.estado) ? t(`filings.estados.${f.estado}`) : ''),
          ),
          cell(date(f.desde)),
          cell(date(f.proxima)),
        ]),
      },
    });
  }

  if (model.contratos.length) {
    add(t('reportPdf.sections.contracts'), {
      key: 'contracts',
      paragraphs: [],
      table: {
        columns: [{ label: c('counterparty') }, { label: c('what') }, { label: c('date') }],
        wide: 0,
        rows: model.contratos.map((x) => [
          cell(x.contraparte, x.tipo),
          cell(t(`contracts.keyDate.${x.kind}`)),
          cell(date(x.fecha)),
        ]),
      },
    });
  }

  if (model.proximos.length) {
    add(t('reportPdf.sections.upcoming', { days: UPCOMING_DAYS }), {
      key: 'upcoming',
      paragraphs: [],
      table: {
        columns: [{ label: c('date') }, { label: c('what') }, { label: c('kind') }],
        wide: 1,
        rows: model.proximos.map((i) => [
          cell(date(i.date)),
          cell(i.titulo, i.fatal ? t('reportPdf.fatal') : null),
          cell(kindOf(t, i.table, i.tipo)),
        ]),
      },
    });
  }

  if (model.solicitudes.length) {
    add(t('reportPdf.sections.requests'), {
      key: 'requests',
      paragraphs: [],
      table: {
        columns: [{ label: c('request') }, { label: c('state') }, { label: c('date') }],
        wide: 0,
        rows: model.solicitudes.map((s) => [
          cell(s.titulo),
          cell(oneOf(ESTADOS_SOLICITUD, s.estado) ? t(`requests.estados.${s.estado}`) : ''),
          cell(date(s.fecha)),
        ]),
      },
    });
  }

  return {
    lang,
    title: t('reportPdf.title'),
    subtitle: `${period} · ${input.client}`,
    subjectLabel: t('reportPdf.subject'),
    subject: t('reportPdf.subjectText', { client: input.client, period }),
    cutoff: t('reportPdf.cutoff', { date: longDate(model.today, lang) }),
    sections: sections.map((s, i) => ({ ...s, title: `${String(i + 1)}. ${titles[i] ?? ''}` })),
    closing: t('reportPdf.closing'),
    signer: { name: input.signer, role: t('reportPdf.signerRole'), firm: t('reportPdf.firm') },
    site: 'www.empirica.mx',
    pageLabel: (page, pages) => t('reportPdf.page', { page, pages }),
  };
}
