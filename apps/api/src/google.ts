/**
 * The slice of the Apps Script services the backend uses, as narrow
 * interfaces. Production passes the real globals; tests pass fakes with the
 * same shape (src/testing/google.ts), so the very same code runs in both.
 */

export interface GRange {
  getValues(): unknown[][];
  setValues(values: unknown[][]): unknown;
  setNumberFormat(format: string): unknown;
  setDataValidation(rule: unknown): unknown;
}

export interface GProtection {
  setDescription(description: string): GProtection;
  setWarningOnly(warningOnly: boolean): GProtection;
}

export interface GSheet {
  getName(): string;
  getLastRow(): number;
  getLastColumn(): number;
  getMaxRows(): number;
  getMaxColumns(): number;
  getRange(row: number, column: number, numRows?: number, numColumns?: number): GRange;
  insertRowsAfter(afterPosition: number, howMany: number): unknown;
  insertColumnsAfter(afterPosition: number, howMany: number): unknown;
  setFrozenRows(rows: number): unknown;
  protect(): GProtection;
  getProtections(type: unknown): unknown[];
}

export interface GSpreadsheet {
  getId(): string;
  getSheetByName(name: string): GSheet | null;
  insertSheet(name: string): GSheet;
  getSheets(): GSheet[];
  deleteSheet(sheet: GSheet): unknown;
}

export interface GValidationBuilder {
  requireValueInList(values: string[], showDropdown: boolean): GValidationBuilder;
  setAllowInvalid(allowInvalid: boolean): GValidationBuilder;
  build(): unknown;
}

export interface GIterator<T> {
  hasNext(): boolean;
  next(): T;
}

/** Bytes as Apps Script hands them: signed, -128 to 127. */
export type GBytes = number[];

export interface GBlob {
  getBytes(): GBytes;
  getContentType(): string | null;
  getName(): string | null;
  getDataAsString(charset?: string): string;
}

export interface GFile {
  getId(): string;
  getName(): string;
  getDateCreated(): Date;
  makeCopy(name: string, destination: GFolder): GFile;
  moveTo(destination: GFolder): unknown;
  setTrashed(trashed: boolean): unknown;
  isTrashed(): boolean;
  getBlob(): GBlob;
  getSize(): number;
}

export interface GFolder {
  getId(): string;
  getName(): string;
  createFolder(name: string): GFolder;
  getFiles(): GIterator<GFile>;
  getFoldersByName(name: string): GIterator<GFolder>;
  createFile(blob: GBlob): GFile;
  isTrashed(): boolean;
}

export interface GHttpResponse {
  getResponseCode(): number;
  getContentText(): string;
}

export interface GTrigger {
  getHandlerFunction(): string;
}

/** A Google Calendar event, as the Calendar API (v3) reads and writes it. */
export interface GCalendarEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  transparency?: string;
  source?: { title: string; url: string };
  reminders?: { useDefault: boolean; overrides?: { method: string; minutes: number }[] };
  extendedProperties?: { private?: Record<string, string> };
  updated?: string;
}

export interface GCalendarEventList {
  items?: GCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface GAclRule {
  id?: string;
  role?: string;
  scope?: { type?: string; value?: string };
}

/**
 * The advanced Calendar service (Calendar API v3), enabled in
 * appsscript.json. It throws on an HTTP error; a sync token that expired
 * says "a full sync is required".
 */
export interface GCalendarService {
  Calendars: {
    insert(resource: { summary: string; timeZone: string; description?: string }): { id?: string };
  };
  Events: {
    list(calendarId: string, params: Record<string, unknown>): GCalendarEventList;
    insert(resource: GCalendarEvent, calendarId: string): GCalendarEvent;
    patch(resource: GCalendarEvent, calendarId: string, eventId: string): GCalendarEvent;
    remove(calendarId: string, eventId: string): unknown;
  };
  Acl: {
    list(
      calendarId: string,
      params?: Record<string, unknown>,
    ): {
      items?: GAclRule[];
      nextPageToken?: string;
    };
    insert(
      resource: GAclRule,
      calendarId: string,
      params?: { sendNotifications?: boolean },
    ): GAclRule;
    remove(calendarId: string, ruleId: string): unknown;
  };
}

export interface GMailMessage {
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  name?: string;
  replyTo?: string;
}

export interface GoogleGlobals {
  SpreadsheetApp: {
    openById(id: string): GSpreadsheet;
    create(name: string): GSpreadsheet;
    newDataValidation(): GValidationBuilder;
    ProtectionType: { SHEET: unknown };
    flush(): void;
  };
  PropertiesService: {
    getScriptProperties(): {
      getProperties(): Record<string, string>;
      getProperty(key: string): string | null;
      setProperty(key: string, value: string): unknown;
      deleteProperty(key: string): unknown;
    };
  };
  CacheService: {
    getScriptCache(): {
      get(key: string): string | null;
      put(key: string, value: string, expirationInSeconds?: number): void;
      remove(key: string): void;
    };
  };
  LockService: {
    getScriptLock(): { tryLock(timeoutInMillis: number): boolean; releaseLock(): void };
  };
  UrlFetchApp: {
    fetch(
      url: string,
      params: {
        method: 'post' | 'get';
        contentType?: string;
        payload?: string;
        headers?: Record<string, string>;
        muteHttpExceptions: boolean;
      },
    ): GHttpResponse;
  };
  Utilities: {
    computeDigest(algorithm: unknown, value: string, charset: unknown): number[];
    DigestAlgorithm: { SHA_256: unknown };
    Charset: { UTF_8: unknown };
    base64DecodeWebSafe(encoded: string): GBytes;
    base64Decode(encoded: string): GBytes;
    base64Encode(data: GBytes): string;
    newBlob(data: GBytes, contentType?: string, name?: string): GBlob;
    getUuid(): string;
  };
  DriveApp: {
    getFolderById(id: string): GFolder;
    getFileById(id: string): GFile;
    createFolder(name: string): GFolder;
  };
  ScriptApp: {
    getProjectTriggers(): GTrigger[];
    newTrigger(functionName: string): {
      timeBased(): {
        atHour(hour: number): {
          everyDays(days: number): {
            inTimezone(timezone: string): { create(): GTrigger };
          };
        };
        everyMinutes(minutes: number): { create(): GTrigger };
        everyHours(hours: number): { create(): GTrigger };
      };
    };
    deleteTrigger(trigger: GTrigger): unknown;
    /** Granular consent (consent.ts): what the owner granted, and asking again. */
    AuthMode: { FULL: unknown };
    AuthorizationStatus: { REQUIRED: unknown; NOT_REQUIRED: unknown };
    getAuthorizationInfo(
      authMode: unknown,
      oAuthScopes: string[],
    ): { getAuthorizationStatus(): unknown };
    requireAllScopes?(authMode: unknown): void;
  };
  /** Present when the advanced Calendar service is on (F5); its permission: consent.ts. */
  Calendar?: GCalendarService;
  MailApp: {
    sendEmail(message: GMailMessage): unknown;
    getRemainingDailyQuota(): number;
  };
}
