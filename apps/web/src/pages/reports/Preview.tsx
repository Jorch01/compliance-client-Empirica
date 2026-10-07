import { useTranslation } from 'react-i18next';
import { Logo } from '../../components/Logo.tsx';
import { StatusBadge } from '../../ui/StatusBadge.tsx';
import type { DocCell, DocTable, ReportDoc } from './doc.ts';
import { BAND_TONE } from './reports.ts';

function Cell({ cell }: { cell: DocCell }) {
  return (
    <>
      {cell.text}
      {cell.note ? <span className="block text-xs text-muted-foreground">{cell.note}</span> : null}
    </>
  );
}

function Table({ table, lang }: { table: DocTable; lang: string }) {
  return (
    <div className="relative -mx-1 overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left text-sm" lang={lang}>
        <thead className="bg-primary text-primary-foreground">
          <tr>
            {table.columns.map((c) => (
              <th
                key={c.label}
                scope="col"
                className={`px-3 py-1.5 text-xs font-semibold tracking-[0.12em] uppercase ${c.align === 'right' ? 'text-right' : ''}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-b border-border even:bg-muted">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-1.5 align-top ${table.columns[j]?.align === 'right' ? 'text-right tabular-nums' : ''}`}
                >
                  <Cell cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The report as the client will read it, drawn from the same document as
 * the PDF: same sections, same numbers, same words (in the report's language).
 */
export function ReportPreview({ doc }: { doc: ReportDoc }) {
  const { t } = useTranslation();
  return (
    <article
      lang={doc.lang}
      aria-label={t('reports.preview')}
      className="rounded-card border border-border bg-card p-6 text-card-foreground shadow-card sm:p-10"
    >
      <Logo className="mb-6 h-14 w-auto text-heading" label="" />
      <h2 className="font-display text-3xl font-semibold text-heading">{doc.title}</h2>
      <p className="label-caps mt-1 text-heading">{doc.subtitle}</p>
      <p className="mt-1 text-sm text-muted-foreground">{doc.cutoff}</p>
      <div className="mt-4 rounded-control border border-accent bg-secondary px-4 py-3 text-secondary-foreground">
        <p className="label-caps text-heading">{doc.subjectLabel}</p>
        <p className="mt-1">{doc.subject}</p>
      </div>
      {doc.sections.map((s) => (
        <section key={s.key} className="mt-6" aria-label={s.title}>
          <h3 className="mb-2 font-display text-xl font-semibold text-heading">{s.title}</h3>
          {s.score ? (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="font-display text-4xl font-semibold text-heading">
                {s.score.value}
              </span>
              <StatusBadge tone={BAND_TONE[s.score.band]}>{s.score.label}</StatusBadge>
            </div>
          ) : null}
          {s.paragraphs.map((p, i) => (
            <p
              key={i}
              className={`mb-2 whitespace-pre-line ${s.score ? 'text-sm text-muted-foreground' : ''}`}
            >
              {p}
            </p>
          ))}
          {s.table ? <Table table={s.table} lang={doc.lang} /> : null}
          {(s.groups ?? []).map((g) => (
            <div key={g.title} className="mt-3">
              <p className="label-caps mb-1 text-heading">{g.title}</p>
              <Table table={g.table} lang={doc.lang} />
            </div>
          ))}
          {s.note ? <p className="mt-2 text-sm text-muted-foreground">{s.note}</p> : null}
        </section>
      ))}
      <div className="mt-10">
        <p>{doc.closing}</p>
        <div className="mt-10 w-48 border-t border-accent" />
        <p className="mt-2 font-semibold">{doc.signer.name}</p>
        <p className="text-sm text-muted-foreground">{doc.signer.role}</p>
        <p className="text-sm text-muted-foreground">{doc.signer.firm}</p>
      </div>
    </article>
  );
}
