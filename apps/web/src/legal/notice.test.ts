/**
 * Legal texts are published exactly as the firm wrote them: reading their
 * structure must not lose, add or change a single line.
 */
import { describe, expect, it } from 'vitest';
import notice from './aviso-de-privacidad.txt?raw';
import { linkify, parseNotice, textLines } from './notice.ts';

const sourceLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s*\t\s*/g, '\t'))
    .filter(Boolean);

describe('legal texts', () => {
  it('reads the privacy notice without losing or changing a line', () => {
    const blocks = parseNotice(notice);
    expect(textLines(blocks)).toEqual(sourceLines(notice));

    expect(blocks[0]).toEqual({ kind: 'h1', text: 'Aviso de Privacidad Integral' });
    expect(
      blocks.flatMap((b) => (b.kind === 'h2' ? [b.text.slice(0, b.text.indexOf('.'))] : [])),
    ).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']);
    expect(blocks.flatMap((b) => (b.kind === 'h3' ? [b.text] : []))).toEqual([
      'a) Datos de identificación',
      'b) Datos de contacto',
      'c) Datos recabados de forma automática',
    ]);
    const tables = blocks.flatMap((b) => (b.kind === 'table' ? [b] : []));
    expect(tables).toHaveLength(1);
    expect(tables[0]?.head).toEqual(['Destinatario', 'Finalidad', 'Consentimiento']);
    expect(tables[0]?.rows.map((r) => r.length)).toEqual([3, 3, 3]);
  });

  it('keeps consecutive lines in one paragraph and indented lines as one list', () => {
    expect(parseNotice('Título\n\nUno\nDos\n\n    a\n    b\n\nTres')).toEqual([
      { kind: 'h1', text: 'Título' },
      { kind: 'p', lines: ['Uno', 'Dos'] },
      { kind: 'ul', items: ['a', 'b'] },
      { kind: 'p', lines: ['Tres'] },
    ]);
  });

  it('turns e-mail and web addresses into links, leaving punctuation outside', () => {
    expect(linkify('Escriba a contacto@example.com, o visite https://example.com.')).toEqual([
      { text: 'Escriba a ' },
      { text: 'contacto@example.com', href: 'mailto:contacto@example.com' },
      { text: ', o visite ' },
      { text: 'https://example.com', href: 'https://example.com' },
      { text: '.' },
    ]);
    expect(linkify('Sitio web: https://example.com/aviso')).toEqual([
      { text: 'Sitio web: ' },
      { text: 'https://example.com/aviso', href: 'https://example.com/aviso' },
    ]);
    expect(linkify('Sin enlaces')).toEqual([{ text: 'Sin enlaces' }]);
  });
});
