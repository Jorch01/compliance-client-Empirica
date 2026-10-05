/**
 * Test doubles of the Apps Script services, faithful where it matters:
 * - Sheets keeps a grid with fixed dimensions (writing outside them, or more
 *   than 50,000 characters in a cell, throws, as it does for real), takes a
 *   leading apostrophe as "literal text" and
 *   otherwise converts text the way Sheets does ("007" becomes 7, "TRUE" a
 *   boolean, "2026-10-02" a date, "=…" a formula). Every formula written is
 *   counted, so a test can prove none ever is.
 * - Identity Toolkit verifies only the tokens this fake issued.
 * Only tests import this file.
 */
import { createHash, randomUUID } from 'node:crypto';
import type {
  GBlob,
  GFile,
  GFolder,
  GHttpResponse,
  GIterator,
  GProtection,
  GRange,
  GSheet,
  GSpreadsheet,
  GTrigger,
  GValidationBuilder,
  GoogleGlobals,
} from '../google.ts';
import manifest from '../../appsscript.json' with { type: 'json' };
import { FakeCalendar, FakeMail } from './calendar.ts';
import { FakeGemini } from './gemini.ts';

const OUT_OF_BOUNDS = 'The coordinates of the range are outside the dimensions of the sheet.';

export interface Formula {
  formula: string;
}

export class FakeRange implements GRange {
  readonly #sheet: FakeSheet;
  readonly row: number;
  readonly column: number;
  readonly rows: number;
  readonly columns: number;

  constructor(sheet: FakeSheet, row: number, column: number, rows: number, columns: number) {
    this.#sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }

  getValues(): unknown[][] {
    this.#sheet.reads++;
    const out: unknown[][] = [];
    for (let r = 0; r < this.rows; r++) {
      const line: unknown[] = [];
      for (let c = 0; c < this.columns; c++) {
        const v = this.#sheet.cell(this.row + r, this.column + c);
        line.push(v && typeof v === 'object' && 'formula' in v ? '#ERROR!' : v);
      }
      out.push(line);
    }
    return out;
  }

  setValues(values: unknown[][]): this {
    if (values.length !== this.rows) {
      throw new Error(
        `The number of rows in the data does not match the number of rows in the range. The data has ${values.length} but the range has ${this.rows}.`,
      );
    }
    values.forEach((line, r) => {
      if (line.length !== this.columns) {
        throw new Error(
          `The number of columns in the data does not match the number of columns in the range. The data has ${line.length} but the range has ${this.columns}.`,
        );
      }
      line.forEach((v, c) => {
        this.#sheet.write(this.row + r, this.column + c, v);
      });
    });
    this.#sheet.writes++;
    return this;
  }

  setNumberFormat(format: string): this {
    for (let c = 0; c < this.columns; c++) this.#sheet.formats.set(this.column + c, format);
    return this;
  }

  setDataValidation(rule: unknown): this {
    for (let c = 0; c < this.columns; c++) this.#sheet.validations.set(this.column + c, rule);
    return this;
  }
}

class FakeProtection implements GProtection {
  description = '';
  warningOnly = false;
  setDescription(description: string): this {
    this.description = description;
    return this;
  }
  setWarningOnly(warningOnly: boolean): this {
    this.warningOnly = warningOnly;
    return this;
  }
}

export class FakeSheet implements GSheet {
  readonly #name: string;
  readonly #google: FakeGoogle;
  readonly grid: unknown[][] = [];
  maxRows = 1000;
  maxColumns = 26;
  frozenRows = 0;
  readonly protections: FakeProtection[] = [];
  readonly formats = new Map<number, string>();
  readonly validations = new Map<number, unknown>();
  reads = 0;
  writes = 0;

  constructor(name: string, google: FakeGoogle) {
    this.#name = name;
    this.#google = google;
  }

  getName(): string {
    return this.#name;
  }

  cell(row: number, column: number): unknown {
    return this.grid[row - 1]?.[column - 1] ?? '';
  }

  /** Stores a value the way Sheets interprets what setValues receives. */
  write(row: number, column: number, value: unknown): void {
    if (typeof value === 'string' && value.length > 50_000) {
      throw new Error(
        'Your input contains more than the maximum of 50000 characters in a single cell.',
      );
    }
    const line = (this.grid[row - 1] ??= []);
    line[column - 1] = this.#google.interpret(value);
  }

  getLastRow(): number {
    for (let r = this.grid.length; r > 0; r--) {
      if ((this.grid[r - 1] ?? []).some((v) => v !== '' && v !== undefined && v !== null)) return r;
    }
    return 0;
  }

  getLastColumn(): number {
    let last = 0;
    for (const line of this.grid) {
      for (let c = line.length; c > last; c--) {
        const v = line[c - 1];
        if (v !== '' && v !== undefined && v !== null) {
          last = c;
          break;
        }
      }
    }
    return last;
  }

  getMaxRows(): number {
    return this.maxRows;
  }

  getMaxColumns(): number {
    return this.maxColumns;
  }

  getRange(row: number, column: number, numRows = 1, numColumns = 1): FakeRange {
    if (
      row < 1 ||
      column < 1 ||
      numRows < 1 ||
      numColumns < 1 ||
      row + numRows - 1 > this.maxRows ||
      column + numColumns - 1 > this.maxColumns
    ) {
      throw new Error(OUT_OF_BOUNDS);
    }
    return new FakeRange(this, row, column, numRows, numColumns);
  }

  insertRowsAfter(afterPosition: number, howMany: number): this {
    if (afterPosition > this.maxRows) throw new Error(OUT_OF_BOUNDS);
    this.maxRows += howMany;
    return this;
  }

  insertColumnsAfter(afterPosition: number, howMany: number): this {
    if (afterPosition > this.maxColumns) throw new Error(OUT_OF_BOUNDS);
    this.maxColumns += howMany;
    return this;
  }

  setFrozenRows(rows: number): this {
    this.frozenRows = rows;
    return this;
  }

  protect(): FakeProtection {
    const p = new FakeProtection();
    this.protections.push(p);
    return p;
  }

  getProtections(_type: unknown): unknown[] {
    return [...this.protections];
  }

  /** Data rows as plain objects keyed by header (for assertions). */
  records(): Record<string, unknown>[] {
    const header = (this.grid[0] ?? []).map(String);
    return this.grid
      .slice(1)
      .filter((line) => line.some((v) => v !== '' && v !== undefined))
      .map((line) => Object.fromEntries(header.map((h, i) => [h, line[i] ?? ''])));
  }
}

export class FakeSpreadsheet implements GSpreadsheet {
  readonly id: string;
  readonly name: string;
  readonly sheets: FakeSheet[] = [];
  readonly #google: FakeGoogle;

  constructor(id: string, name: string, google: FakeGoogle) {
    this.id = id;
    this.name = name;
    this.#google = google;
    // New spreadsheets come with one empty tab.
    this.sheets.push(new FakeSheet('Hoja 1', google));
  }

  getId(): string {
    return this.id;
  }

  getSheetByName(name: string): FakeSheet | null {
    return this.sheets.find((s) => s.getName() === name) ?? null;
  }

  insertSheet(name: string): FakeSheet {
    if (this.getSheetByName(name))
      throw new Error(`A sheet with the name "${name}" already exists.`);
    const sheet = new FakeSheet(name, this.#google);
    this.sheets.push(sheet);
    return sheet;
  }

  getSheets(): FakeSheet[] {
    return [...this.sheets];
  }

  deleteSheet(sheet: GSheet): void {
    const i = this.sheets.indexOf(sheet as FakeSheet);
    if (i < 0) throw new Error('Sheet not found');
    if (this.sheets.length === 1) throw new Error('You cannot delete the only sheet.');
    this.sheets.splice(i, 1);
  }
}

const unsigned = (data: readonly number[]): Buffer => Buffer.from(data.map((b) => (b + 256) % 256));

class FakeBlob implements GBlob {
  readonly bytes: Buffer;
  readonly contentType: string | null;
  readonly name: string | null;

  constructor(bytes: Buffer, contentType: string | null = null, name: string | null = null) {
    this.bytes = bytes;
    this.contentType = contentType;
    this.name = name;
  }

  getBytes(): number[] {
    return signed(this.bytes);
  }
  getContentType(): string | null {
    return this.contentType;
  }
  getName(): string | null {
    return this.name;
  }
  getDataAsString(): string {
    return this.bytes.toString('utf8');
  }
}

class FakeFile implements GFile {
  readonly id: string;
  name: string;
  readonly created: Date;
  parent: FakeFolder | null;
  trashed = false;
  readonly content: Buffer;
  readonly mimeType: string | null;
  readonly #google: FakeGoogle;

  constructor(
    google: FakeGoogle,
    id: string,
    name: string,
    parent: FakeFolder | null,
    content: Buffer = Buffer.alloc(0),
    mimeType: string | null = null,
  ) {
    this.#google = google;
    this.id = id;
    this.name = name;
    this.parent = parent;
    this.content = content;
    this.mimeType = mimeType;
    this.created = new Date(google.now());
    google.files.set(id, this);
  }

  getBlob(): FakeBlob {
    return new FakeBlob(this.content, this.mimeType, this.name);
  }
  getSize(): number {
    return this.content.length;
  }

  getId(): string {
    return this.id;
  }
  getName(): string {
    return this.name;
  }
  getDateCreated(): Date {
    return this.created;
  }
  makeCopy(name: string, destination: GFolder): FakeFile {
    return new FakeFile(this.#google, `file-${randomUUID()}`, name, destination as FakeFolder);
  }
  moveTo(destination: GFolder): this {
    this.parent = destination as FakeFolder;
    return this;
  }
  setTrashed(trashed: boolean): this {
    this.trashed = trashed;
    return this;
  }
  isTrashed(): boolean {
    return this.trashed;
  }
}

class FakeFolder implements GFolder {
  readonly id: string;
  readonly name: string;
  readonly parent: FakeFolder | null;
  trashed = false;
  readonly #google: FakeGoogle;

  constructor(google: FakeGoogle, name: string, parent: FakeFolder | null) {
    this.#google = google;
    this.id = `folder-${randomUUID()}`;
    this.name = name;
    this.parent = parent;
    google.folders.set(this.id, this);
  }

  getId(): string {
    return this.id;
  }
  getName(): string {
    return this.name;
  }
  createFolder(name: string): FakeFolder {
    return new FakeFolder(this.#google, name, this);
  }
  getFiles(): GIterator<GFile> {
    const files = [...this.#google.files.values()].filter((f) => f.parent === this);
    let i = 0;
    return { hasNext: () => i < files.length, next: () => files[i++] as GFile };
  }
  getFoldersByName(name: string): GIterator<GFolder> {
    const folders = [...this.#google.folders.values()].filter(
      (f) => f.parent === this && f.name === name && !f.trashed,
    );
    let i = 0;
    return { hasNext: () => i < folders.length, next: () => folders[i++] as GFolder };
  }
  createFile(blob: GBlob): FakeFile {
    const b = blob as FakeBlob;
    if (b.bytes.length > 50 * 1024 * 1024) throw new Error('File too large (50 MB).');
    return new FakeFile(
      this.#google,
      `file-${randomUUID()}`,
      b.name ?? 'Untitled',
      this,
      b.bytes,
      b.contentType,
    );
  }
  isTrashed(): boolean {
    return this.trashed;
  }
}

const b64url = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
const signed = (bytes: Uint8Array): number[] => [...bytes].map((b) => (b > 127 ? b - 256 : b));

export interface IssueOptions {
  uid: string;
  email: string;
  emailVerified?: boolean;
  projectId?: string;
  /** Seconds until expiry (default one hour). */
  expiresIn?: number;
}

/** Issues ID tokens and answers accounts:lookup like Identity Toolkit. */
export class FakeFirebase {
  readonly projectId: string;
  readonly apiKey: string;
  readonly #google: FakeGoogle;
  readonly #tokens = new Map<string, IssueOptions & { exp: number }>();
  lookups = 0;
  failWith: number | null = null;

  constructor(google: FakeGoogle, projectId: string, apiKey: string) {
    this.#google = google;
    this.projectId = projectId;
    this.apiKey = apiKey;
  }

  issue(options: IssueOptions): string {
    const projectId = options.projectId ?? this.projectId;
    const exp = Math.floor(this.#google.now() / 1000) + (options.expiresIn ?? 3600);
    const payload = {
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      sub: options.uid,
      email: options.email,
      email_verified: options.emailVerified ?? true,
      iat: exp - 3600,
      exp,
    };
    const token = `${b64url('{"alg":"RS256","typ":"JWT"}')}.${b64url(JSON.stringify(payload))}.${b64url(randomUUID())}`;
    this.#tokens.set(token, { ...options, exp });
    return token;
  }

  lookup(apiKey: string | undefined, body: string): { status: number; body: unknown } {
    this.lookups++;
    if (this.failWith)
      return { status: this.failWith, body: { error: { message: 'BACKEND_ERROR' } } };
    if (apiKey !== this.apiKey)
      return { status: 400, body: { error: { message: 'API key not valid.' } } };
    const { idToken } = JSON.parse(body) as { idToken?: string };
    const entry = idToken ? this.#tokens.get(idToken) : undefined;
    if (!entry) return { status: 400, body: { error: { message: 'INVALID_ID_TOKEN' } } };
    if (entry.exp * 1000 < this.#google.now()) {
      return { status: 400, body: { error: { message: 'TOKEN_EXPIRED' } } };
    }
    return {
      status: 200,
      body: {
        users: [
          { localId: entry.uid, email: entry.email, emailVerified: entry.emailVerified ?? true },
        ],
      },
    };
  }
}

export class FakeGoogle {
  readonly now: () => number;
  readonly spreadsheets = new Map<string, FakeSpreadsheet>();
  readonly folders = new Map<string, FakeFolder>();
  readonly files = new Map<string, FakeFile>();
  readonly props = new Map<string, string>();
  readonly cache = new Map<string, { value: string; expires: number }>();
  readonly triggers: { handler: string; hour?: number; minutes?: number }[] = [];
  readonly firebase: FakeFirebase;
  readonly calendar = new FakeCalendar();
  readonly mail = new FakeMail();
  readonly gemini = new FakeGemini();
  /** Pauses asked for (Utilities.sleep), in milliseconds: tests never wait. */
  readonly sleeps: number[] = [];
  /** False while the advanced Calendar service is off: the `Calendar` global is missing. */
  calendarAuthorized = true;
  /**
   * The manifest's permissions the owner granted. Google's consent screen
   * lets the account leave some out (granular consent): take one away to
   * see the portal wait for it.
   */
  readonly grantedScopes = new Set<string>(manifest.oauthScopes);
  /** Formulas that reached a cell: must stay zero. */
  formulas: string[] = [];
  lockBusy = false;
  locksTaken = 0;
  /** Calls to PropertiesService (each one counts against the daily quota). */
  propertyCalls = 0;
  readonly globals: GoogleGlobals & { ContentService: unknown; console: Console };

  constructor(now: () => number, projectId = 'empirica-portal-test', apiKey = 'test-server-key') {
    this.now = now;
    this.firebase = new FakeFirebase(this, projectId, apiKey);
    this.globals = this.#buildGlobals();
  }

  /** A file already in Drive, as the demo data says (a document's file). */
  seedFile(id: string, name: string, content: string, mimeType: string): void {
    if (!this.files.has(id)) {
      new FakeFile(this, id, name, null, Buffer.from(content, 'utf8'), mimeType);
    }
  }

  /** What Sheets stores for a value given to setValues. */
  interpret(value: unknown): unknown {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') return value;
    if (value.startsWith("'")) return value.slice(1);
    if (value.startsWith('=')) {
      this.formulas.push(value);
      return { formula: value } satisfies Formula;
    }
    if (/^[-+]?\d+(\.\d+)?$/.test(value)) return Number(value);
    if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00-05:00`);
    return value;
  }

  spreadsheet(): FakeSpreadsheet {
    const id = this.props.get('SPREADSHEET_ID');
    const ss = id ? this.spreadsheets.get(id) : undefined;
    if (!ss) throw new Error('No spreadsheet yet: run setup');
    return ss;
  }

  sheet(name: string): FakeSheet {
    const sheet = this.spreadsheet().getSheetByName(name);
    if (!sheet) throw new Error(`No sheet ${name}`);
    return sheet;
  }

  /** What Apps Script says when the owner did not grant email. */
  #needsMail(method: string): void {
    const scope = 'https://www.googleapis.com/auth/script.send_mail';
    if (!this.grantedScopes.has(scope)) {
      throw new Error(
        `You do not have permission to call ${method}. Required permissions: ${scope}`,
      );
    }
  }

  #buildGlobals(): GoogleGlobals & { ContentService: unknown; console: Console } {
    const validation = (): GValidationBuilder => {
      const rule: { values: string[]; allowInvalid: boolean } = { values: [], allowInvalid: false };
      const builder: GValidationBuilder = {
        requireValueInList: (values) => ((rule.values = values), builder),
        setAllowInvalid: (allow) => ((rule.allowInvalid = allow), builder),
        build: () => ({ ...rule }),
      };
      return builder;
    };
    const trigger = (handler: string): GTrigger => ({ getHandlerFunction: () => handler });
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the Calendar getter below reads the flag live
    const self = this;

    return {
      SpreadsheetApp: {
        openById: (id) => {
          const ss = this.spreadsheets.get(id);
          if (!ss) {
            throw new Error(
              'Exception: Unexpected error while getting the method or property openById on object SpreadsheetApp.',
            );
          }
          return ss;
        },
        create: (name) => {
          const id = `ss-${randomUUID()}`;
          const ss = new FakeSpreadsheet(id, name, this);
          this.spreadsheets.set(id, ss);
          new FakeFile(this, id, name, null);
          return ss;
        },
        newDataValidation: validation,
        ProtectionType: { SHEET: 'SHEET' },
        flush: () => undefined,
      },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperties: () => {
            this.propertyCalls++;
            return Object.fromEntries(this.props);
          },
          getProperty: (key) => {
            this.propertyCalls++;
            return this.props.get(key) ?? null;
          },
          setProperty: (key, value) => {
            this.propertyCalls++;
            this.props.set(key, value);
          },
          deleteProperty: (key) => {
            this.propertyCalls++;
            this.props.delete(key);
          },
        }),
      },
      CacheService: {
        getScriptCache: () => ({
          get: (key) => {
            const entry = this.cache.get(key);
            if (!entry || entry.expires <= this.now()) return null;
            return entry.value;
          },
          put: (key, value, seconds = 600) => {
            this.cache.set(key, { value, expires: this.now() + seconds * 1000 });
          },
          remove: (key) => {
            this.cache.delete(key);
          },
        }),
      },
      LockService: {
        getScriptLock: () => ({
          tryLock: () => {
            if (this.lockBusy) return false;
            this.locksTaken++;
            return true;
          },
          releaseLock: () => undefined,
        }),
      },
      UrlFetchApp: {
        fetch: (url, params): GHttpResponse => {
          const result =
            url === 'https://identitytoolkit.googleapis.com/v1/accounts:lookup'
              ? this.firebase.lookup(params.headers?.['x-goog-api-key'], params.payload ?? '')
              : url.startsWith('https://generativelanguage.googleapis.com/')
                ? this.gemini.handle(url, params.method, params.headers ?? {}, params.payload ?? '')
                : { status: 404, body: { error: { message: 'NOT_FOUND' } } };
          return {
            getResponseCode: () => result.status,
            getContentText: () => JSON.stringify(result.body),
          };
        },
      },
      Utilities: {
        computeDigest: (_algorithm, value) =>
          signed(createHash('sha256').update(value, 'utf8').digest()),
        DigestAlgorithm: { SHA_256: 'SHA_256' },
        Charset: { UTF_8: 'UTF_8' },
        base64DecodeWebSafe: (encoded) => signed(Buffer.from(encoded, 'base64url')),
        base64Decode: (encoded) => {
          // Apps Script refuses what is not base64, as the real one does.
          if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
            throw new Error('Could not decode string.');
          }
          return signed(Buffer.from(encoded, 'base64'));
        },
        base64Encode: (data) => unsigned(data).toString('base64'),
        newBlob: (data, contentType, name) =>
          new FakeBlob(unsigned(data), contentType ?? null, name ?? null),
        getUuid: () => randomUUID(),
        formatDate: (date, timeZone) =>
          new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(date),
        sleep: (ms) => {
          this.sleeps.push(ms);
        },
      },
      DriveApp: {
        getFolderById: (id) => {
          const folder = this.folders.get(id);
          if (!folder) throw new Error('No item with the given ID could be found.');
          return folder;
        },
        getFileById: (id) => {
          const file = this.files.get(id);
          if (!file) throw new Error('No item with the given ID could be found.');
          return file;
        },
        createFolder: (name) => new FakeFolder(this, name, null),
      },
      ScriptApp: {
        getProjectTriggers: () => this.triggers.map((t) => trigger(t.handler)),
        newTrigger: (handler) => ({
          timeBased: () => ({
            atHour: (hour) => ({
              everyDays: () => ({
                inTimezone: () => ({
                  create: () => {
                    this.triggers.push({ handler, hour });
                    return trigger(handler);
                  },
                }),
              }),
            }),
            everyMinutes: (minutes) => ({
              create: () => {
                this.triggers.push({ handler, minutes });
                return trigger(handler);
              },
            }),
            everyHours: (hours) => ({
              create: () => {
                this.triggers.push({ handler, minutes: hours * 60 });
                return trigger(handler);
              },
            }),
          }),
        }),
        deleteTrigger: (t) => {
          const i = this.triggers.findIndex((x) => x.handler === t.getHandlerFunction());
          if (i >= 0) this.triggers.splice(i, 1);
        },
        AuthMode: { FULL: 'FULL' },
        AuthorizationStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED' },
        getAuthorizationInfo: (_mode, scopes) => ({
          getAuthorizationStatus: () =>
            scopes.every((s) => this.grantedScopes.has(s)) ? 'NOT_REQUIRED' : 'REQUIRED',
        }),
        // In the editor Google ends the run and shows its consent window again.
        requireAllScopes: () => {
          if (manifest.oauthScopes.some((s) => !this.grantedScopes.has(s))) {
            throw new Error('Authorization is required to perform that action.');
          }
        },
      },
      get Calendar() {
        return self.calendarAuthorized ? self.calendar : undefined;
      },
      MailApp: {
        sendEmail: (message) => {
          this.#needsMail('MailApp.sendEmail');
          this.mail.sendEmail(message);
        },
        getRemainingDailyQuota: () => {
          this.#needsMail('MailApp.getRemainingDailyQuota');
          return this.mail.getRemainingDailyQuota();
        },
      },
      ContentService: {
        MimeType: { JSON: 'application/json', ICAL: 'text/calendar' },
        createTextOutput(content: string) {
          return {
            content,
            mimeType: '',
            setMimeType(type: string) {
              this.mimeType = type;
              return this;
            },
          };
        },
      },
      console: { ...console, log: () => undefined },
    };
  }
}
