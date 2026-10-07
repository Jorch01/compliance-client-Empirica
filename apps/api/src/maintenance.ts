/**
 * Nightly jobs (one time trigger, created by setup()):
 * - copy the spreadsheet into Respaldos and keep the last 30 copies;
 * - purge the idempotency records (OpsAplicadas) older than twice the days a
 *   device may stay offline: by then no device can resend those operations;
 * - purge the notices read more than 60 days ago, or never read in a year
 *   (F7): every device drops them by the same rule (isStaleNotice);
 * - once a year, move the past years' audit entries to their own spreadsheet
 *   in Respaldos (F7), so the live tab only holds this year's;
 * - on the first of the month, tell each client's lawyer that last month's
 *   report is ready to prepare (F6).
 */
import {
  isStaleNotice,
  parseInstant,
  text,
  toProjectDate,
  type Row,
  type TableName,
} from '@empirica/shared';
import { remindMonthlyReports } from './actions/reports.ts';
import { runDailyBackup } from './backup.ts';
import { AuditArchive } from './db/archive.ts';
import { Database, openSpreadsheet } from './db/database.ts';
import { PROP, type Env } from './env.ts';
import { SPREADSHEET_NAME } from './setup.ts';

export const DEFAULT_OFFLINE_DAYS = 14;
export const AUDIT_ARCHIVE_PREFIX = `${SPREADSHEET_NAME} bitácora `;

/** Rewrites a tab without the rows `stale` picks (under the script lock); returns how many went. */
function purge(
  env: Env,
  name: TableName,
  staleIn: (db: Database) => (row: Row) => boolean,
): number {
  const lock = env.g.LockService.getScriptLock();
  if (!lock.tryLock(30_000)) return 0; // busy: tomorrow will do
  try {
    const db = new Database(env);
    const stale = staleIn(db);
    const table = db.table(name);
    const all = table.all();
    const keep = all.filter((r) => !stale(r));
    if (keep.length < all.length) table.replaceAll(keep);
    return all.length - keep.length;
  } finally {
    lock.releaseLock();
  }
}

export function purgeAppliedOps(env: Env): number {
  const now = env.now();
  return purge(env, 'OpsAplicadas', (db) => {
    const setting = db.rows('Config').find((c) => c.clave === 'diasSinConexion');
    const days = Number((setting && text(setting, 'valor')) ?? DEFAULT_OFFLINE_DAYS);
    const keepMs =
      2 * (Number.isFinite(days) && days > 0 ? days : DEFAULT_OFFLINE_DAYS) * 86_400_000;
    return (r) => {
      const at = parseInstant(r.fecha);
      return at !== null && now - at > keepMs;
    };
  });
}

/** The bell's old notices: read more than 60 days ago, or never read in a year. */
export function purgeOldNotices(env: Env): number {
  const now = env.now();
  return purge(env, 'Notificaciones', () => (r) => isStaleNotice(r, now));
}

/** Entries moved per turn of the lock, and how long one night may spend moving them. */
const ARCHIVE_CHUNK = 2_000;
const ARCHIVE_BUDGET_MS = 3 * 60_000;

/**
 * Once a year (LIMITES.md § 2, D66): the audit entries of past years move to
 * one spreadsheet per year in Respaldos ("EMPIRICA_PORTAL_DB bitácora 2026"),
 * and the live tab keeps this year's. A chunk per turn of the lock, so the
 * portal keeps answering; what a night leaves, the next one finishes. The
 * rest of the year it only reads a property.
 */
export function archiveAuditLog(
  env: Env,
  options: { chunk?: number; budgetMs?: number } = {},
): Record<string, number> {
  const thisYear = Number(toProjectDate(env.now()).slice(0, 4));
  const done = Number(env.prop(PROP.auditArchivedYear) ?? 0);
  if (done >= thisYear - 1) return {};
  const folderId = env.prop(PROP.backupsFolderId);
  if (!folderId) throw new Error('Falta ejecutar setup(): no hay carpeta de respaldos.');
  const live = openSpreadsheet(env).getSheetByName('Bitacora');
  if (!live) throw new Error('Falta la pestaña Bitacora: ejecuta setup().');
  const archive = new AuditArchive(
    env,
    env.g.DriveApp.getFolderById(folderId),
    (year) => `${AUDIT_ARCHIVE_PREFIX}${String(year)}`,
  );
  const started = env.now();
  const moved: Record<string, number> = {};
  for (;;) {
    if (env.now() - started > (options.budgetMs ?? ARCHIVE_BUDGET_MS)) return moved;
    const lock = env.g.LockService.getScriptLock();
    if (!lock.tryLock(30_000)) return moved; // busy: tomorrow goes on
    let more: boolean;
    try {
      const turn = archive.moveOldest(live, thisYear, options.chunk ?? ARCHIVE_CHUNK);
      for (const [year, n] of turn.moved) moved[String(year)] = (moved[String(year)] ?? 0) + n;
      more = turn.more;
    } finally {
      lock.releaseLock();
    }
    if (!more) break;
  }
  env.setProp(PROP.auditArchivedYear, String(thisYear - 1));
  return moved;
}

/** Runs a job; if it fails, the log says so and the rest of the night goes on. */
function attempt<T>(env: Env, what: string, job: () => T, fallback: T): T {
  try {
    return job();
  } catch (error) {
    env.log(what, { error: String(error) });
    return fallback;
  }
}

export function runNightly(env: Env): {
  backup: string;
  removedCopies: number;
  purgedOps: number;
  purgedNotices: number;
  archivedAudit: Record<string, number>;
  reportNotices: number;
} {
  const backup = runDailyBackup(env);
  const purgedOps = purgeAppliedOps(env);
  // Tomorrow tries again what fails tonight (the backup is already made).
  const purgedNotices = attempt(env, 'Avisos viejos no depurados', () => purgeOldNotices(env), 0);
  const archivedAudit = attempt<Record<string, number>>(
    env,
    'Bitácora no archivada',
    () => archiveAuditLog(env),
    {},
  );
  // Tomorrow is not the first: say it in the log.
  const reportNotices = attempt(
    env,
    'Aviso de reportes no creado',
    () => remindMonthlyReports(env),
    0,
  );
  env.log('Tareas nocturnas', {
    respaldo: backup.copy,
    operacionesDepuradas: purgedOps,
    avisosDepurados: purgedNotices,
    bitacoraArchivada: archivedAudit,
    avisosDeReporte: reportNotices,
  });
  return {
    backup: backup.copy,
    removedCopies: backup.removed,
    purgedOps,
    purgedNotices,
    archivedAudit,
    reportNotices,
  };
}
