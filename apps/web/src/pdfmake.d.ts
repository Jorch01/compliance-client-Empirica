/** The part of pdfmake 0.3's browser build the portal uses (the package ships no types). */
declare module 'pdfmake/build/pdfmake' {
  interface PdfOutput {
    getBlob(): Promise<Blob>;
  }
  interface PdfMake {
    setFonts(
      fonts: Record<string, Record<'normal' | 'bold' | 'italics' | 'bolditalics', string>>,
    ): void;
    setUrlAccessPolicy(policy: (url: string) => boolean): void;
    createPdf(definition: object): PdfOutput;
  }
  const pdfMake: PdfMake;
  export default pdfMake;
}
