/**
 * Legal texts arrive from the firm as plain text and are published exactly
 * as they are: this only recognizes their structure, it never rewrites a
 * word. The layout of the text decides it:
 *
 * - the first line is the title;
 * - "I. …", "II. …" are sections and "a) …" their parts;
 * - indented lines are list items;
 * - lines with tabs are table rows (the first one, the header);
 * - anything else is a paragraph; consecutive lines stay in one paragraph.
 */
export type Block =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

const SECTION = /^[IVXLC]+\.\s/;
const PART = /^[a-z]\)\s/;

export function parseNotice(source: string): Block[] {
  const blocks: Block[] = [];
  let open: Block | null = null;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      open = null;
      continue;
    }
    if (!blocks.length) {
      blocks.push({ kind: 'h1', text: line });
    } else if (SECTION.test(line) || PART.test(line)) {
      blocks.push({ kind: SECTION.test(line) ? 'h2' : 'h3', text: line });
      open = null;
    } else if (raw.includes('\t')) {
      const cells = line.split('\t').map((c) => c.trim());
      if (open?.kind === 'table') open.rows.push(cells);
      else blocks.push((open = { kind: 'table', head: cells, rows: [] }));
    } else if (/^\s/.test(raw)) {
      if (open?.kind === 'ul') open.items.push(line);
      else blocks.push((open = { kind: 'ul', items: [line] }));
    } else if (open?.kind === 'p') {
      open.lines.push(line);
    } else {
      blocks.push((open = { kind: 'p', lines: [line] }));
    }
  }
  return blocks;
}

/** Every line of text, in order, as the blocks hold it (tests use it to prove nothing is lost). */
export function textLines(blocks: readonly Block[]): string[] {
  return blocks.flatMap((b) => {
    switch (b.kind) {
      case 'p':
        return b.lines;
      case 'ul':
        return b.items;
      case 'table':
        return [b.head, ...b.rows].map((cells) => cells.join('\t'));
      default:
        return [b.text];
    }
  });
}

export type Piece = { text: string } | { text: string; href: string };

/** Splits a line so that e-mail addresses and web addresses become links. */
export function linkify(line: string): Piece[] {
  const pieces: Piece[] = [];
  const pattern = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https?:\/\/[^\s]+?)(?=[.,;:)]?(?:\s|$))/g;
  let last = 0;
  for (const m of line.matchAll(pattern)) {
    const [match, email] = m;
    if (m.index > last) pieces.push({ text: line.slice(last, m.index) });
    pieces.push({ text: match, href: email ? `mailto:${email}` : match });
    last = m.index + match.length;
  }
  if (last < line.length) pieces.push({ text: line.slice(last) });
  return pieces;
}
