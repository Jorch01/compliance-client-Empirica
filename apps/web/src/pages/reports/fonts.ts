/**
 * The report's fonts for pdfmake (D55): static WOFF files of the brand's
 * typefaces, Latin only (Spanish and English). pdfmake reads WOFF but not
 * WOFF2, which is why these are not the files the screens use. Vite gives
 * each one an address in the build; the service worker keeps them, so a PDF
 * can be made without a connection.
 */
import cormorant600 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff?url';
import cormorant700 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff?url';
import montserrat400 from '@fontsource/montserrat/files/montserrat-latin-400-normal.woff?url';
import montserrat400i from '@fontsource/montserrat/files/montserrat-latin-400-italic.woff?url';
import montserrat600 from '@fontsource/montserrat/files/montserrat-latin-600-normal.woff?url';
import montserrat600i from '@fontsource/montserrat/files/montserrat-latin-600-italic.woff?url';
import type { PdfFonts } from './pdf.ts';

/** pdfmake downloads only absolute http(s) addresses. */
const absolute = (url: string): string => new URL(url, document.baseURI).href;

export function reportFonts(): PdfFonts {
  return {
    Montserrat: {
      normal: absolute(montserrat400),
      bold: absolute(montserrat600),
      italics: absolute(montserrat400i),
      bolditalics: absolute(montserrat600i),
    },
    Cormorant: {
      normal: absolute(cormorant600),
      bold: absolute(cormorant700),
      italics: absolute(cormorant600),
      bolditalics: absolute(cormorant700),
    },
  };
}
