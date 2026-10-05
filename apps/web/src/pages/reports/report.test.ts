/**
 * The monthly report as the lawyer reviews it and the client receives it:
 * made from what a user of the whole client sees, in the report's language.
 * (Its PDF is rendered in integration/report-pdf.test.ts, in Node.)
 */
import { describe, expect, it } from 'vitest';
import { demoDoc } from './demo-doc.ts';

describe('the monthly report document', () => {
  it('numbers its sections, in the report’s language, with nothing internal', () => {
    const doc = demoDoc('es');
    expect(doc.title).toBe('Reporte mensual de seguimiento');
    expect(doc.subtitle).toBe('septiembre de 2026 · Cliente Demo, S.A. de C.V.');
    expect(doc.cutoff).toBe('Datos al 5 de octubre de 2026');
    const titles = doc.sections.map((s) => s.title);
    expect(titles.slice(0, 3)).toEqual([
      '1. Resumen ejecutivo',
      '2. Índice de salud',
      '3. El mes en números',
    ]);
    titles.forEach((title, i) => {
      expect(title.startsWith(`${String(i + 1)}. `)).toBe(true);
    });
    expect(doc.sections[0]?.paragraphs).toEqual(['Primer párrafo.', 'Segundo párrafo.']);

    const text = JSON.stringify(doc);
    expect(text).toContain('Entregar acta constitutiva');
    // Internal records, and another client's, are not even counted.
    for (const hidden of [
      'Revisar criterio',
      'Reunir pruebas',
      'Análisis de contingencia',
      'Enviar logotipo',
      'Registro de marca',
    ]) {
      expect(text).not.toContain(hidden);
    }
    expect(doc.pageLabel(2, 3)).toBe('Página 2 de 3');
  });

  it('in English when the client reads English; without a summary it says so', () => {
    const doc = demoDoc('en', null);
    expect(doc.title).toBe('Monthly follow-up report');
    expect(doc.subtitle).toBe('September 2026 · Cliente Demo, S.A. de C.V.');
    expect(doc.sections[0]).toMatchObject({
      title: '1. Executive summary',
      paragraphs: ['No summary.'],
    });
    expect(doc.signer).toEqual({
      name: 'Abogado Demo',
      role: 'Responsible lawyer',
      firm: 'Empírica Legal Lab',
    });
  });
});
