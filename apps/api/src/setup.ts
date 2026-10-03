/**
 * setup(): run once from the Apps Script editor by the owner account (and
 * again after each update; it is idempotent). It creates whatever is
 * missing and never deletes or reorders anything:
 * - the EMPIRICA_PORTAL_DB spreadsheet, with one tab per table, headers,
 *   frozen header row, plain-text format on text columns, drop-downs on
 *   closed lists and a warning when someone edits by hand;
 * - the Drive folders: Empírica Portal / Clientes and Respaldos;
 * - the initial SOCIO_ADMIN users from the ADMIN_EMAILS property;
 * - the default settings;
 * - the nightly trigger (backup and cleanup).
 */
import { TABLES, TABLE_NAMES, allColumns, text, toProjectIso, type Row } from '@empirica/shared';
import { CONFIG_DEFAULTS } from './config.ts';
import { Database, Sequence } from './db/database.ts';
import { Writer } from './db/writer.ts';
import { PROP, type Env } from './env.ts';
import type { GFolder, GSheet, GSpreadsheet } from './google.ts';

export const SPREADSHEET_NAME = 'EMPIRICA_PORTAL_DB';
export const ROOT_FOLDER_NAME = 'Empírica Portal';
export const BACKUP_HOUR = 3;
/** Entry point the nightly trigger calls (see main.ts). */
export const NIGHTLY_HANDLER = 'nightly';

const TEXT_TYPES = new Set([
  'id',
  'ref',
  'string',
  'text',
  'email',
  'json',
  'date',
  'datetime',
  'enum',
]);

export interface SetupReport {
  spreadsheetId: string;
  created: string[];
  warnings: string[];
}

function openOrCreateSpreadsheet(env: Env, report: SetupReport): GSpreadsheet {
  const id = env.prop(PROP.spreadsheetId);
  if (id) {
    try {
      return env.g.SpreadsheetApp.openById(id);
    } catch {
      report.warnings.push(
        `No se pudo abrir la hoja ${id}; se crea una nueva. Si fue un error, restaura SPREADSHEET_ID.`,
      );
    }
  }
  const ss = env.g.SpreadsheetApp.create(SPREADSHEET_NAME);
  env.setProp(PROP.spreadsheetId, ss.getId());
  report.created.push(`hoja ${SPREADSHEET_NAME}`);
  return ss;
}

function folder(
  env: Env,
  key: string,
  name: string,
  parent: GFolder | null,
  report: SetupReport,
): GFolder {
  const id = env.prop(key);
  if (id) {
    try {
      return env.g.DriveApp.getFolderById(id);
    } catch {
      report.warnings.push(`No se encontró la carpeta ${name}; se crea otra.`);
    }
  }
  const created = parent ? parent.createFolder(name) : env.g.DriveApp.createFolder(name);
  env.setProp(key, created.getId());
  report.created.push(`carpeta ${name}`);
  return created;
}

function ensureTab(
  env: Env,
  ss: GSpreadsheet,
  name: (typeof TABLE_NAMES)[number],
  report: SetupReport,
): void {
  const def = TABLES[name];
  const columns = allColumns(def);
  let sheet: GSheet | null = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    report.created.push(`pestaña ${name}`);
  }
  const lastColumn = sheet.getLastColumn();
  const header =
    lastColumn > 0
      ? (sheet.getRange(1, 1, 1, lastColumn).getValues()[0] ?? []).map((h) => String(h).trim())
      : [];
  const missing = columns.filter((c) => !header.includes(c.name));
  if (missing.length) {
    const start = header.length + 1;
    const needed = header.length + missing.length;
    const maxColumns = sheet.getMaxColumns();
    if (needed > maxColumns) sheet.insertColumnsAfter(maxColumns, needed - maxColumns);
    sheet.getRange(1, start, 1, missing.length).setValues([missing.map((c) => c.name)]);
    if (header.length)
      report.created.push(`columnas ${missing.map((c) => c.name).join(', ')} en ${name}`);

    const rows = Math.max(1, sheet.getMaxRows() - 1);
    missing.forEach((c, i) => {
      const range = sheet.getRange(2, start + i, rows, 1);
      if (TEXT_TYPES.has(c.type)) range.setNumberFormat('@');
      if (c.type === 'enum' && c.values?.length) {
        range.setDataValidation(
          env.g.SpreadsheetApp.newDataValidation()
            .requireValueInList([...c.values], true)
            .setAllowInvalid(true)
            .build(),
        );
      }
    });
  }
  sheet.setFrozenRows(1);
  if (!sheet.getProtections(env.g.SpreadsheetApp.ProtectionType.SHEET).length) {
    sheet
      .protect()
      .setDescription(
        'Base del portal: edítala desde el portal. Los cambios a mano pueden romper la sincronización.',
      )
      .setWarningOnly(true);
  }
}

function base(id: string, serverNow: string, by: string): Row {
  return {
    id,
    createdAt: serverNow,
    createdBy: by,
    updatedAt: serverNow,
    updatedBy: by,
    version: 1,
    deleted: null,
    fieldTimestamps: {},
  };
}

export function runSetup(env: Env): SetupReport {
  const report: SetupReport = { spreadsheetId: '', created: [], warnings: [] };
  const lock = env.g.LockService.getScriptLock();
  if (!lock.tryLock(30_000))
    throw new Error('Otro proceso está usando el portal; intenta de nuevo en un minuto.');
  try {
    const ss = openOrCreateSpreadsheet(env, report);
    report.spreadsheetId = ss.getId();
    for (const name of TABLE_NAMES) ensureTab(env, ss, name, report);
    // A new spreadsheet comes with an empty default tab; ours replace it.
    for (const sheet of ss.getSheets()) {
      const name = sheet.getName();
      if (
        !(TABLE_NAMES as readonly string[]).includes(name) &&
        sheet.getLastRow() === 0 &&
        ss.getSheets().length > 1
      ) {
        ss.deleteSheet(sheet);
      }
    }

    const root = folder(env, PROP.rootFolderId, ROOT_FOLDER_NAME, null, report);
    folder(env, PROP.clientsFolderId, 'Clientes', root, report);
    folder(env, PROP.backupsFolderId, 'Respaldos', root, report);
    if (report.created.includes(`hoja ${SPREADSHEET_NAME}`)) {
      env.g.DriveApp.getFileById(ss.getId()).moveTo(root);
    }

    const db = new Database(env, ss);
    const seq = new Sequence(env);
    const serverNow = toProjectIso(env.now());
    const writer = new Writer(db, seq, { userId: 'setup', serverNow });

    const admins = (env.prop(PROP.adminEmails) ?? '')
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (!admins.length) {
      report.warnings.push(
        'ADMIN_EMAILS está vacío: nadie podrá administrar el portal. Agrégalo en Script Properties.',
      );
    }
    const known = new Set(db.rows('Usuarios').map((u) => text(u, 'email')?.toLowerCase()));
    for (const email of admins) {
      if (known.has(email)) continue;
      writer.save('Usuarios', undefined, {
        ...base(env.uuid(), serverNow, 'setup'),
        email,
        nombre: email.split('@')[0] ?? email,
        lado: 'EMPIRICA',
        rolBase: 'SOCIO_ADMIN',
        estado: 'ACTIVO',
        idioma: 'es',
      });
      report.created.push(`usuario SOCIO_ADMIN ${email}`);
    }

    const keys = new Set(db.rows('Config').map((c) => c.clave));
    for (const d of CONFIG_DEFAULTS) {
      if (keys.has(d.clave)) continue;
      writer.save('Config', undefined, { ...base(env.uuid(), serverNow, 'setup'), ...d });
      report.created.push(`ajuste ${d.clave}`);
    }

    if (db.pendingWrites)
      writer.audit('SISTEMA', 'Sistema', 'setup', null, null, { creado: report.created });
    seq.reserve();
    db.flush();
    seq.commit();

    const triggers = env.g.ScriptApp.getProjectTriggers();
    if (!triggers.some((t) => t.getHandlerFunction() === NIGHTLY_HANDLER)) {
      env.g.ScriptApp.newTrigger(NIGHTLY_HANDLER)
        .timeBased()
        .atHour(BACKUP_HOUR)
        .everyDays(1)
        .inTimezone('America/Cancun')
        .create();
      report.created.push('tareas nocturnas a las 3:00 (respaldo y limpieza)');
    }
    return report;
  } finally {
    lock.releaseLock();
  }
}
