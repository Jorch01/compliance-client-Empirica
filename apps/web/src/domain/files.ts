/**
 * A file in the browser: read it, send it as base64, save what comes back.
 * Works the same in the tests (Node has atob and btoa too).
 */

const CHUNK = 0x8000;

export function bytesToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** "2.4 MB", "830 KB": a size for people. */
export function formatBytes(bytes: number, locale: string): string {
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(1, kb))} KB`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(kb / 1024)} MB`;
}

/**
 * Hands a downloaded file to the browser to save. Always as a download,
 * never opened inside the portal: a file runs nothing on this page.
 */
export function saveFile(nombre: string, mimeType: string, base64: string): void {
  saveBlob(nombre, new Blob([base64ToBytes(base64)], { type: mimeType }));
}

/** The same, for a file made in this browser (a report's PDF). */
export function saveBlob(nombre: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombre;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
