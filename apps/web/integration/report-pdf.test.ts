// @vitest-environment node
/**
 * The monthly report's PDF renders with the brand's fonts. In Node: pdfkit
 * does not take the fonts jsdom hands it (another realm's Uint8Array).
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoDoc } from '../src/pages/reports/demo-doc.ts';
import { pdfDefinition, type PdfFonts } from '../src/pages/reports/pdf.ts';

const require = createRequire(import.meta.url);

/** The brand's WOFF files from node_modules, as the browser gets them from the build. */
function nodeFonts(): PdfFonts {
  const montserrat = (file: string): string =>
    join(dirname(require.resolve('@fontsource/montserrat/package.json')), 'files', file);
  const cormorant = (file: string): string =>
    join(dirname(require.resolve('@fontsource/cormorant-garamond/package.json')), 'files', file);
  return {
    Montserrat: {
      normal: montserrat('montserrat-latin-400-normal.woff'),
      bold: montserrat('montserrat-latin-600-normal.woff'),
      italics: montserrat('montserrat-latin-400-italic.woff'),
      bolditalics: montserrat('montserrat-latin-600-italic.woff'),
    },
    Cormorant: {
      normal: cormorant('cormorant-garamond-latin-600-normal.woff'),
      bold: cormorant('cormorant-garamond-latin-700-normal.woff'),
      italics: cormorant('cormorant-garamond-latin-600-normal.woff'),
      bolditalics: cormorant('cormorant-garamond-latin-700-normal.woff'),
    },
  };
}

describe('the monthly report PDF', () => {
  it('renders with the brand’s fonts, embedded', async () => {
    const pdfmake = require('pdfmake') as {
      setFonts: (fonts: PdfFonts) => void;
      setUrlAccessPolicy: (policy: () => boolean) => void;
      setLocalAccessPolicy: (policy: (path: string) => boolean) => void;
      createPdf: (definition: object) => { getBuffer: () => Promise<Buffer> };
    };
    const fonts = nodeFonts();
    pdfmake.setFonts(fonts);
    pdfmake.setUrlAccessPolicy(() => false);
    const allowed = new Set(Object.values(fonts).flatMap((f) => Object.values(f)));
    pdfmake.setLocalAccessPolicy((path) => allowed.has(path));
    const pdf = await pdfmake.createPdf(pdfDefinition(demoDoc('es'))).getBuffer();
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // The fonts are embedded (subset), not replaced by a standard one.
    const raw = pdf.toString('latin1');
    expect(raw).toMatch(/Montserrat/);
    expect(raw).toMatch(/Cormorant/);
    expect(pdf.length).toBeLessThan(400_000);
    // For a visual check: REPORT_PDF_OUT=/path/report.pdf npx vitest run …
    const out = process.env.REPORT_PDF_OUT;
    if (out) writeFileSync(out, pdf);
  });
});
