/**
 * The report's PDF, made in the browser with pdfmake (D55), in the firm's
 * format (PLAN.md § 8): the letterhead's logo, green headings, the ASUNTO
 * box, tables with a green header, labels in small capitals, the seal as a
 * watermark, the signature and the page numbers. It is drawn from the same
 * document as the preview. Every color is a token.
 *
 * pdfmake (about 1 MB) and the fonts load only when a PDF is made.
 */
import type { HealthBand } from '@empirica/shared';
import { logos, tokens, type LogoGeometry } from '@empirica/shared/brand';
import type { DocCell, DocSection, DocTable, ReportDoc } from './doc.ts';

export type PdfFonts = Record<
  string,
  Record<'normal' | 'bold' | 'italics' | 'bolditalics', string>
>;

const C = tokens.themes.light.colors;
const STATUS = tokens.themes.light.status;
const BRAND = tokens.brand;
const ACCENT = tokens.ramps.accent;
const NEUTRAL = tokens.ramps.neutral;

/** Points a heading needs below it to stay on its page: its own line, a table's header, two rows. */
const KEEP_WITH_HEADING = 110;

const BAND_COLOR: Record<HealthBand, string> = {
  good: STATUS.success['on-subtle'],
  watch: STATUS.warning['on-subtle'],
  risk: STATUS.danger['on-subtle'],
};

/** A logo of the brand as SVG, in one color. */
export function logoSvg(logo: LogoGeometry, fill: string): string {
  const paths = logo.paths.map((d) => `<path d="${d}" fill="${fill}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo.viewBox}">${paths}</svg>`;
}

/** Small capitals as the brand writes its labels: capitals, spaced. */
const caps = (text: string, lang: string): string => text.toLocaleUpperCase(lang);

function cellContent(c: DocCell, align: 'left' | 'right'): object {
  return c.note
    ? {
        stack: [
          { text: c.text },
          { text: c.note, fontSize: 7.5, color: C['muted-foreground'], margin: [0, 1, 0, 0] },
        ],
        alignment: align,
      }
    : { text: c.text, alignment: align };
}

function table(t: DocTable, lang: string): object {
  const align = (i: number): 'left' | 'right' => t.columns[i]?.align ?? 'left';
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: t.columns.map((_, i) => (i === t.wide ? '*' : 'auto')),
      body: [
        t.columns.map((col, i) => ({
          text: caps(col.label, lang),
          bold: true,
          fontSize: 7,
          characterSpacing: 0.9,
          color: C['primary-foreground'],
          alignment: align(i),
        })),
        ...t.rows.map((row) => row.map((c, i) => cellContent(c, align(i)))),
      ],
    },
    layout: {
      fillColor: (row: number) => (row === 0 ? BRAND.green : row % 2 === 0 ? NEUTRAL['50'] : null),
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === node.table.body.length ? 0 : 0.5,
      vLineWidth: () => 0,
      hLineColor: () => C.border,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 2, 0, 4],
  };
}

function section(s: DocSection, lang: string): object[] {
  const out: object[] = [
    {
      text: s.title,
      font: 'Cormorant',
      bold: true,
      fontSize: 15,
      color: C.heading,
      margin: [0, 16, 0, 6],
      headlineLevel: 1,
    },
  ];
  if (s.score) {
    out.push({
      columns: [
        {
          width: 'auto',
          text: String(s.score.value),
          font: 'Cormorant',
          bold: true,
          fontSize: 32,
          color: BAND_COLOR[s.score.band],
        },
        {
          width: '*',
          margin: [10, 8, 0, 0],
          stack: [
            { text: s.score.label, bold: true, color: BAND_COLOR[s.score.band] },
            ...s.paragraphs.map((p) => ({ text: p, fontSize: 8.5, color: C['muted-foreground'] })),
          ],
        },
      ],
      margin: [0, 0, 0, 6],
    });
  } else {
    for (const p of s.paragraphs) out.push({ text: p, margin: [0, 0, 0, 6] });
  }
  if (s.table) out.push(table(s.table, lang));
  for (const g of s.groups ?? []) {
    out.push({
      text: caps(g.title, lang),
      fontSize: 7.5,
      bold: true,
      characterSpacing: 1.1,
      color: ACCENT['700'],
      margin: [0, 6, 0, 3],
    });
    out.push(table(g.table, lang));
  }
  if (s.note) out.push({ text: s.note, fontSize: 8.5, color: C['muted-foreground'] });
  return out;
}

/** The pdfmake definition of a report (pure: the tests render it in Node). */
export function pdfDefinition(doc: ReportDoc): object {
  const lang = doc.lang === 'en' ? 'en-US' : 'es-MX';
  const logo = logoSvg(logos.logo, BRAND.green);
  const seal = logoSvg(logos.sello, BRAND.blush);
  return {
    pageSize: 'LETTER',
    pageMargins: [72, 112, 64, 72],
    info: {
      title: `${doc.title} · ${doc.subtitle}`,
      author: doc.signer.firm,
      subject: doc.subject,
      creator: 'Empírica Portal',
    },
    header: () => ({ svg: logo, width: 118, margin: [60, 34, 0, 0] }),
    background: (_page: number, size: { width: number; height: number }) => ({
      svg: seal,
      width: 300,
      absolutePosition: { x: size.width - 240, y: size.height - 290 },
    }),
    footer: (page: number, pages: number) => ({
      margin: [72, 28, 64, 0],
      columns: [
        { text: doc.site, color: ACCENT['700'], characterSpacing: 0.6 },
        { text: doc.pageLabel(page, pages), alignment: 'right', color: C['muted-foreground'] },
      ],
      fontSize: 7.5,
    }),
    // A heading never ends a page alone: with less room below it than a heading, a table's
    // header and its first rows take, it starts the next page. Its own position decides: the
    // nodes after it are not reliable (the page's footer counts, and a table row that moved
    // to the next page still reports this one).
    pageBreakBefore: (node: {
      headlineLevel?: number;
      startPosition?: { verticalRatio: number; pageInnerHeight: number };
    }) =>
      node.headlineLevel === 1 &&
      node.startPosition !== undefined &&
      (1 - node.startPosition.verticalRatio) * node.startPosition.pageInnerHeight <
        KEEP_WITH_HEADING,
    defaultStyle: { font: 'Montserrat', fontSize: 9, color: C.foreground, lineHeight: 1.3 },
    content: [
      { text: doc.title, font: 'Cormorant', bold: true, fontSize: 24, color: C.heading },
      {
        text: caps(doc.subtitle, lang),
        fontSize: 7.5,
        bold: true,
        characterSpacing: 1.3,
        color: ACCENT['700'],
        margin: [0, 4, 0, 2],
      },
      { text: doc.cutoff, fontSize: 8, color: C['muted-foreground'], margin: [0, 0, 0, 12] },
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  {
                    text: caps(doc.subjectLabel, lang),
                    fontSize: 7,
                    bold: true,
                    characterSpacing: 1.4,
                    color: C.heading,
                  },
                  { text: doc.subject, margin: [0, 3, 0, 0] },
                ],
                margin: [10, 8, 10, 8],
                fillColor: BRAND.blush,
              },
            ],
          ],
        },
        layout: {
          hLineColor: () => BRAND.peach,
          vLineColor: () => BRAND.peach,
          hLineWidth: () => 0.8,
          vLineWidth: () => 0.8,
        },
      },
      ...doc.sections.flatMap((s) => section(s, lang)),
      {
        unbreakable: true,
        stack: [
          { text: doc.closing, margin: [0, 26, 0, 34] },
          {
            canvas: [
              {
                type: 'line',
                x1: 0,
                y1: 0,
                x2: 190,
                y2: 0,
                lineWidth: 0.6,
                lineColor: BRAND.peach,
              },
            ],
          },
          { text: doc.signer.name, bold: true, margin: [0, 6, 0, 0] },
          { text: doc.signer.role, fontSize: 8, color: C['muted-foreground'] },
          { text: doc.signer.firm, fontSize: 8, color: C['muted-foreground'] },
        ],
      },
    ],
  };
}

/** The PDF of a report, made in this browser (lazily loads pdfmake and the fonts). */
export async function renderReportPdf(doc: ReportDoc): Promise<Blob> {
  const [{ default: pdfMake }, { reportFonts }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('./fonts.ts'),
  ]);
  pdfMake.setFonts(reportFonts());
  // Only the portal's own files (the fonts): a report never fetches anything else.
  pdfMake.setUrlAccessPolicy((url) => url.startsWith(`${window.location.origin}/`));
  return pdfMake.createPdf(pdfDefinition(doc)).getBlob();
}
