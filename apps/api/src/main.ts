/**
 * Apps Script entry points. Apps Script calls these by name, so build.ts
 * exposes each export listed in ENTRY_POINTS as a top-level function of the
 * single bundled file.
 */
import { API_VERSION, toProjectIso } from '@empirica/shared';
import { createEnv, type Env } from './env.ts';
import type { GoogleGlobals } from './google.ts';
import { runNightly } from './maintenance.ts';
import { handleRequest } from './router.ts';
import { runSetup, type SetupReport } from './setup.ts';

interface TextOutputFactory {
  ContentService: {
    MimeType: { JSON: unknown };
    createTextOutput(content: string): { setMimeType(type: unknown): unknown };
  };
}

const env = (): Env => createEnv(globalThis as unknown as GoogleGlobals);

function json(body: unknown): unknown {
  const { ContentService } = globalThis as unknown as TextOutputFactory;
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/** Health check: tells the portal (and a person with the URL) that the API is up. */
export function doGet(_e?: unknown): unknown {
  return json({
    ok: true,
    data: { service: 'Empírica Portal API', apiVersion: API_VERSION },
    serverNow: toProjectIso(Date.now()),
  });
}

/** Every API call: POST with a text/plain body (no CORS preflight). */
export function doPost(e?: { postData?: { contents?: string } }): unknown {
  return json(handleRequest(env(), e?.postData?.contents ?? ''));
}

/** Run once from the editor (and after each update): creates whatever is missing. */
export function setup(): SetupReport {
  const report = runSetup(env());
  console.log(
    [
      `Hoja: https://docs.google.com/spreadsheets/d/${report.spreadsheetId}`,
      report.created.length
        ? `Creado: ${report.created.join('; ')}`
        : 'Nada nuevo: todo estaba listo.',
      ...report.warnings.map((w) => `Aviso: ${w}`),
    ].join('\n'),
  );
  return report;
}

/** Daily time trigger (created by setup): backup and cleanup. */
export function nightly(): void {
  runNightly(env());
}
