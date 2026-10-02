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

export interface GFile {
  getId(): string;
  getName(): string;
  getDateCreated(): Date;
  makeCopy(name: string, destination: GFolder): GFile;
  moveTo(destination: GFolder): unknown;
  setTrashed(trashed: boolean): unknown;
  isTrashed(): boolean;
}

export interface GFolder {
  getId(): string;
  getName(): string;
  createFolder(name: string): GFolder;
  getFiles(): GIterator<GFile>;
}

export interface GHttpResponse {
  getResponseCode(): number;
  getContentText(): string;
}

export interface GTrigger {
  getHandlerFunction(): string;
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
    base64DecodeWebSafe(encoded: string): number[];
    newBlob(data: number[]): { getDataAsString(charset?: string): string };
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
      };
    };
  };
}
