/**
 * Reads the device's local copy (IndexedDB) from the page, with the raw API:
 * what a user could dig out of their own browser.
 */
import type { Page } from '@playwright/test';

export function localRows(page: Page, table: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (store: string) => {
    const names = (await indexedDB.databases()).map((d) => d.name ?? '');
    const name = names.find((n) => n.startsWith('empirica-'));
    if (!name) return [];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(new Error(String(req.error)));
      };
    });
    try {
      if (!db.objectStoreNames.contains(store)) return [];
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => {
          resolve(req.result as Record<string, unknown>[]);
        };
        req.onerror = () => {
          reject(new Error(String(req.error)));
        };
      });
    } finally {
      db.close();
    }
  }, table);
}

/** Every text value stored on the device, to search for what must never be there. */
export async function everything(page: Page, tables: string[]): Promise<string> {
  const parts: string[] = [];
  for (const t of tables) parts.push(JSON.stringify(await localRows(page, t)));
  return parts.join('\n');
}
