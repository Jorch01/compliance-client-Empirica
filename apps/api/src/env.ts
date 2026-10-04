/**
 * Everything the backend needs from the outside world, in one object, so
 * every module receives it explicitly and the tests can replace it.
 */
import type { GoogleGlobals } from './google.ts';

/** Script Properties keys. Secrets live here and nowhere else. */
export const PROP = {
  spreadsheetId: 'SPREADSHEET_ID',
  rootFolderId: 'ROOT_FOLDER_ID',
  clientsFolderId: 'CLIENTS_FOLDER_ID',
  backupsFolderId: 'BACKUPS_FOLDER_ID',
  seqReserved: 'SEQ_RESERVED',
  seqCommitted: 'SEQ_COMMITTED',
  firebaseApiKey: 'FIREBASE_SERVER_API_KEY',
  firebaseProjectId: 'FIREBASE_PROJECT_ID',
  adminEmails: 'ADMIN_EMAILS',
  /** Fingerprint of the data model the spreadsheet was last brought up to. */
  schemaVersion: 'SCHEMA_VERSION',
} as const;

export interface Env {
  g: GoogleGlobals;
  now(): number;
  prop(key: string): string | null;
  setProp(key: string, value: string): void;
  cacheGet(key: string): string | null;
  cachePut(key: string, value: string, seconds: number): void;
  sha256Hex(text: string): string;
  /** Decodes base64url (JWT segments) into UTF-8 text. */
  base64UrlDecode(text: string): string;
  uuid(): string;
  log(message: string, details?: unknown): void;
}

/**
 * One Env per request. Script Properties are read once, all together: a free
 * account allows 50,000 reads and writes a day (docs/LIMITES.md), and every
 * request needs several of them.
 */
export function createEnv(g: GoogleGlobals, now: () => number = () => Date.now()): Env {
  const props = g.PropertiesService.getScriptProperties();
  const cache = g.CacheService.getScriptCache();
  let loaded: Record<string, string> | null = null;
  const all = (): Record<string, string> => (loaded ??= { ...props.getProperties() });
  return {
    g,
    now,
    prop: (key) => all()[key] ?? null,
    setProp: (key, value) => {
      props.setProperty(key, value);
      all()[key] = value;
    },
    cacheGet: (key) => cache.get(key),
    cachePut: (key, value, seconds) => {
      // CacheService keeps entries between 1 second and 6 hours.
      cache.put(key, value, Math.max(1, Math.min(21_600, Math.floor(seconds))));
    },
    sha256Hex: (text) =>
      g.Utilities.computeDigest(
        g.Utilities.DigestAlgorithm.SHA_256,
        text,
        g.Utilities.Charset.UTF_8,
      )
        .map((b) => ((b + 256) % 256).toString(16).padStart(2, '0'))
        .join(''),
    base64UrlDecode: (text) => {
      const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
      return g.Utilities.newBlob(g.Utilities.base64DecodeWebSafe(padded)).getDataAsString('UTF-8');
    },
    uuid: () => g.Utilities.getUuid(),
    log: (message, details) => {
      console.log(details === undefined ? message : `${message} ${JSON.stringify(details)}`);
    },
  };
}
