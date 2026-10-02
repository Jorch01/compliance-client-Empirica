/**
 * Daily copy of the whole spreadsheet into Empírica Portal / Respaldos,
 * keeping the 30 most recent. Runs from a time trigger set by setup().
 */
import { toProjectDate } from '@empirica/shared';
import { PROP, type Env } from './env.ts';
import type { GFile } from './google.ts';
import { SPREADSHEET_NAME } from './setup.ts';

export const BACKUPS_KEPT = 30;
export const BACKUP_PREFIX = `${SPREADSHEET_NAME} respaldo `;

export function runDailyBackup(env: Env): { copy: string; removed: number } {
  const spreadsheetId = env.prop(PROP.spreadsheetId);
  const folderId = env.prop(PROP.backupsFolderId);
  if (!spreadsheetId || !folderId)
    throw new Error('Falta ejecutar setup(): no hay hoja o carpeta de respaldos.');
  const folder = env.g.DriveApp.getFolderById(folderId);
  const name = `${BACKUP_PREFIX}${toProjectDate(env.now())}`;
  env.g.DriveApp.getFileById(spreadsheetId).makeCopy(name, folder);

  const copies: GFile[] = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (!file.isTrashed() && file.getName().startsWith(BACKUP_PREFIX)) copies.push(file);
  }
  copies.sort((a, b) => b.getDateCreated().getTime() - a.getDateCreated().getTime());
  const old = copies.slice(BACKUPS_KEPT);
  for (const file of old) file.setTrashed(true);
  env.log('Respaldo diario', { copia: name, eliminadas: old.length });
  return { copy: name, removed: old.length };
}
