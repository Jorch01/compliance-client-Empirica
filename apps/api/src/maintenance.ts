/**
 * Nightly jobs (one time trigger, created by setup()):
 * - copy the spreadsheet into Respaldos and keep the last 30 copies;
 * - purge the idempotency records (OpsAplicadas) older than twice the days a
 *   device may stay offline: by then no device can resend those operations.
 */
import { parseInstant, text } from '@empirica/shared';
import { runDailyBackup } from './backup.ts';
import { Database } from './db/database.ts';
import type { Env } from './env.ts';

export const DEFAULT_OFFLINE_DAYS = 14;

export function purgeAppliedOps(env: Env): number {
  const lock = env.g.LockService.getScriptLock();
  if (!lock.tryLock(30_000)) return 0; // busy: tomorrow will do
  try {
    const db = new Database(env);
    const setting = db.rows('Config').find((c) => c.clave === 'diasSinConexion');
    const days = Number((setting && text(setting, 'valor')) ?? DEFAULT_OFFLINE_DAYS);
    const keepMs =
      2 * (Number.isFinite(days) && days > 0 ? days : DEFAULT_OFFLINE_DAYS) * 86_400_000;
    const now = env.now();
    const table = db.table('OpsAplicadas');
    const all = table.all();
    const keep = all.filter((r) => {
      const at = parseInstant(r.fecha);
      return at === null || now - at <= keepMs;
    });
    if (keep.length < all.length) table.replaceAll(keep);
    return all.length - keep.length;
  } finally {
    lock.releaseLock();
  }
}

export function runNightly(env: Env): { backup: string; removedCopies: number; purgedOps: number } {
  const backup = runDailyBackup(env);
  const purgedOps = purgeAppliedOps(env);
  env.log('Tareas nocturnas', { respaldo: backup.copy, operacionesDepuradas: purgedOps });
  return { backup: backup.copy, removedCopies: backup.removed, purgedOps };
}
