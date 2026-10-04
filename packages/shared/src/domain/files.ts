/**
 * The files the portal keeps for its documents (Documentos): which types
 * and how big. The browser refuses early, before queueing a file; the
 * server refuses for real.
 *
 * The type is decided by the file's extension, never by what the device
 * claims, and nothing a browser would run is accepted (HTML, SVG,
 * scripts): a downloaded file opens outside the portal, never inside it.
 */

/** Extension → MIME type of every accepted file. */
export const FILE_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  txt: 'text/plain',
  csv: 'text/csv',
  // CFDI (electronic invoices) are XML.
  xml: 'application/xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  zip: 'application/zip',
  msg: 'application/vnd.ms-outlook',
  eml: 'message/rfc822',
};

/** "Contrato.PDF" → "pdf"; "" when the name has no extension. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The MIME type of an accepted file, or null if the portal does not take it. */
export function fileMimeType(name: string): string | null {
  return FILE_TYPES[extensionOf(name)] ?? null;
}

/** The extensions for a file picker: ".pdf,.docx,…". */
export const FILE_ACCEPT = Object.keys(FILE_TYPES)
  .map((ext) => `.${ext}`)
  .join(',');

/**
 * The most `Config.mbMaxArchivo` may allow: what one request to Apps Script
 * carries comfortably in base64 (Drive itself takes up to 50 MB per file
 * from Apps Script, docs/LIMITES.md).
 */
export const MAX_FILE_MB = 30;

/** Bytes allowed per file, from `Config.mbMaxArchivo` (10 by default). */
export function maxFileBytes(mb: number): number {
  const allowed = Number.isFinite(mb) && mb > 0 ? Math.min(mb, MAX_FILE_MB) : 10;
  return Math.round(allowed * 1024 * 1024);
}

/** Bytes a base64 text decodes to, without decoding it. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
