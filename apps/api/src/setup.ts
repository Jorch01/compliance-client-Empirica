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
 * It also checks the Firebase properties sign-in needs (checkFirebase), and
 * the Gemini key of the AI helpers (checkGemini).
 */
import { TABLES, TABLE_NAMES, allColumns, text, toProjectIso, type Row } from '@empirica/shared';
import { checkKey, geminiKey } from './ai/gemini.ts';
import { lookupAccount } from './auth.ts';
import { calendarService, firmCalendarId } from './calendar/sync.ts';
import { CONFIG_DEFAULTS } from './config.ts';
import { Database, Sequence, openSpreadsheet } from './db/database.ts';
import { Writer } from './db/writer.ts';
import { PROP, type Env } from './env.ts';
import { ApiError } from './errors.ts';
import type { GFolder, GSheet, GSpreadsheet } from './google.ts';
import { mailAllowed } from './mail/send.ts';

export const SPREADSHEET_NAME = 'EMPIRICA_PORTAL_DB';
export const ROOT_FOLDER_NAME = 'Empírica Portal';
export const BACKUP_HOUR = 3;
/** Entry point the nightly trigger calls (see main.ts). */
export const NIGHTLY_HANDLER = 'nightly';
/** Entry points of the F5 triggers: the calendars every 15 minutes, the summary every hour. */
export const CALENDAR_HANDLER = 'syncCalendars';
export const DIGEST_HANDLER = 'dailyDigest';

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
  /** What was checked and is fine. */
  checked: string[];
  warnings: string[];
}

/**
 * Sign-in needs both Firebase properties. The server key is tried against
 * Identity Toolkit with a token that cannot exist: a key that works answers
 * INVALID_ID_TOKEN. Neither value is ever written to the log.
 */
/**
 * F5: Calendar and email need the owner's permission (running setup from
 * the editor asks for it). The firm's calendar is created here the first
 * time; the emails left today are reported.
 */
/** What to do when Google's consent window left a permission out (consent.ts). */
const GRANT_AGAIN =
  'ejecuta setup otra vez y, en la ventana de Google, marca «Seleccionar todo» antes de «Continuar»';

export function checkCalendarAndMail(env: Env, report: SetupReport): void {
  const cal = calendarService(env);
  if (!env.g.Calendar) {
    report.warnings.push(
      'Calendar no está activado: el servicio avanzado de Calendar falta en appsscript.json.',
    );
  } else if (!cal) {
    report.warnings.push(`Falta el permiso de calendarios: ${GRANT_AGAIN}.`);
  } else {
    try {
      const existed = Boolean(env.prop(PROP.firmCalendarId));
      firmCalendarId(env, cal);
      if (existed) report.checked.push('Calendar: el calendario del despacho existe.');
      else report.created.push('calendario de Google "Empírica · Despacho"');
    } catch (error) {
      report.warnings.push(
        `Calendar: no se pudo crear el calendario del despacho (${error instanceof Error ? error.message : String(error)}).`,
      );
    }
  }
  if (!mailAllowed(env)) {
    report.warnings.push(`Falta el permiso de correo: ${GRANT_AGAIN}.`);
    return;
  }
  try {
    report.checked.push(
      `Correo: quedan ${String(env.g.MailApp.getRemainingDailyQuota())} destinatarios hoy.`,
    );
  } catch (error) {
    report.warnings.push(
      `Correo: MailApp no responde (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
}

export function checkFirebase(env: Env, report: SetupReport): void {
  const projectId = env.prop(PROP.firebaseProjectId);
  const apiKey = env.prop(PROP.firebaseApiKey);
  if (!projectId || !apiKey) {
    const missing = [PROP.firebaseProjectId, PROP.firebaseApiKey].filter((k) => !env.prop(k));
    report.warnings.push(
      `Falta ${missing.join(' y ')} en Script Properties: nadie podrá iniciar sesión en el portal (docs/SETUP.md, paso 5).`,
    );
    return;
  }
  let answer: string;
  try {
    const { status, body } = lookupAccount(env, apiKey, 'setup-check');
    if (status === 400 && body.error?.message?.startsWith('INVALID_ID_TOKEN')) {
      report.checked.push(`Firebase: proyecto ${projectId}; la key del servidor funciona.`);
      return;
    }
    answer = `${status}: ${body.error?.message ?? 'sin detalle'}`;
  } catch (error) {
    answer = String(error);
  }
  report.warnings.push(
    `FIREBASE_SERVER_API_KEY no funciona con Identity Toolkit (${answer}). Debe ser la key "portal-servidor" del paso 3, sin restricción de sitios web: la del navegador no sirve aquí.`,
  );
}

/**
 * The AI (F6, IA.md) needs GEMINI_API_KEY. Without it the portal works and
 * the AI buttons say it is not configured. With it, the key is tried by
 * listing the models it may use, and the one the portal would pick is
 * named. The key is never written to the log.
 */
export function checkGemini(env: Env, report: SetupReport): void {
  const key = geminiKey(env);
  if (!key) {
    report.warnings.push(
      `Falta ${PROP.geminiKey} en Script Properties: el portal funciona, pero sin las ayudas de IA (docs/IA.md).`,
    );
    return;
  }
  let result: ReturnType<typeof checkKey>;
  try {
    result = checkKey(env, key);
  } catch (error) {
    report.warnings.push(`Gemini no respondió (${String(error).slice(0, 200)}).`);
    return;
  }
  if (!result.ok) {
    report.warnings.push(
      `${PROP.geminiKey} no funciona (Google respondió ${String(result.status)}). Crea la clave en Google AI Studio y cópiala tal cual en Script Properties.`,
    );
    return;
  }
  report.checked.push(
    result.model
      ? `Gemini: la clave funciona; el portal usará ${result.model}.`
      : 'Gemini: la clave funciona, pero Google no ofrece ningún modelo adecuado por ahora.',
  );
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

/**
 * The data model as the spreadsheet must hold it: tabs, columns, types and
 * closed lists. Its fingerprint changes only when the model does.
 */
export function schemaPrint(env: Env): string {
  const model = [
    ...TABLE_NAMES.map((name) => [
      name,
      allColumns(TABLES[name]).map((c) => [c.name, c.type, ...(c.values ?? [])].join(':')),
    ]),
    // A new setting is part of the model too: the first request creates it.
    ['Config', CONFIG_DEFAULTS.map((d) => d.clave)],
  ];
  return env.sha256Hex(JSON.stringify(model)).slice(0, 16);
}

/** The settings the code knows and the Config tab lacks, with their defaults. */
function addMissingSettings(env: Env, db: Database, writer: Writer, report: SetupReport): void {
  const keys = new Set(db.rows('Config').map((c) => c.clave));
  for (const d of CONFIG_DEFAULTS) {
    if (keys.has(d.clave)) continue;
    writer.save('Config', undefined, {
      ...base(env.uuid(), writer.meta.serverNow, writer.meta.userId),
      ...d,
    });
    report.created.push(`ajuste ${d.clave}`);
  }
}

/**
 * Brings the spreadsheet up to the deployed model: the first request after a
 * deploy that adds a tab or a column creates it, as setup() would, so a new
 * version never breaks for lack of a tab. Afterwards it costs nothing: the
 * fingerprint is read with the other properties. It only adds; it never
 * deletes, renames or reorders.
 */
export function ensureSchema(env: Env): void {
  const print = schemaPrint(env);
  if (env.prop(PROP.schemaVersion) === print) return;
  // Not set up yet: setup() creates everything, the first time by hand.
  if (!env.prop(PROP.spreadsheetId)) return;
  const lock = env.g.LockService.getScriptLock();
  if (!lock.tryLock(10_000)) throw new ApiError('BUSY');
  try {
    const ss = openSpreadsheet(env);
    const report: SetupReport = {
      spreadsheetId: ss.getId(),
      created: [],
      checked: [],
      warnings: [],
    };
    for (const name of TABLE_NAMES) ensureTab(env, ss, name, report);
    const db = new Database(env, ss);
    const seq = new Sequence(env);
    const writer = new Writer(db, seq, { userId: 'setup', serverNow: toProjectIso(env.now()) });
    addMissingSettings(env, db, writer, report);
    if (db.pendingWrites) {
      writer.audit('SISTEMA', 'Sistema', 'esquema', null, null, { creado: report.created });
      seq.reserve();
      db.flush();
      seq.commit();
    }
    env.setProp(PROP.schemaVersion, print);
    if (report.created.length) env.log('Esquema actualizado', report.created);
  } finally {
    lock.releaseLock();
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
  const report: SetupReport = { spreadsheetId: '', created: [], checked: [], warnings: [] };
  const lock = env.g.LockService.getScriptLock();
  if (!lock.tryLock(30_000))
    throw new Error('Otro proceso está usando el portal; intenta de nuevo en un minuto.');
  try {
    const ss = openOrCreateSpreadsheet(env, report);
    report.spreadsheetId = ss.getId();
    for (const name of TABLE_NAMES) ensureTab(env, ss, name, report);
    env.setProp(PROP.schemaVersion, schemaPrint(env));
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

    addMissingSettings(env, db, writer, report);

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
    checkCalendarAndMail(env, report);
    if (!triggers.some((t) => t.getHandlerFunction() === CALENDAR_HANDLER)) {
      env.g.ScriptApp.newTrigger(CALENDAR_HANDLER).timeBased().everyMinutes(15).create();
      report.created.push('calendarios de Google cada 15 minutos');
    }
    if (!triggers.some((t) => t.getHandlerFunction() === DIGEST_HANDLER)) {
      env.g.ScriptApp.newTrigger(DIGEST_HANDLER).timeBased().everyHours(1).create();
      report.created.push('resumen diario (se revisa cada hora; sale a la hora de horaResumen)');
    }
    checkFirebase(env, report);
    checkGemini(env, report);
    return report;
  } finally {
    lock.releaseLock();
  }
}
