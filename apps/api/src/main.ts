/**
 * Apps Script entry points. Apps Script calls these by name, so build.ts
 * exposes each export listed in ENTRY_POINTS as a top-level function of the
 * single bundled file.
 */
import { API_VERSION, toProjectIso } from '@empirica/shared';
import { icsFeed } from './calendar/feed.ts';
import { syncCalendars as runCalendarSync, type CalendarSyncReport } from './calendar/sync.ts';
import { requireAllScopes } from './consent.ts';
import { createEnv, type Env } from './env.ts';
import type { GoogleGlobals } from './google.ts';
import { runDigest, type DigestReport } from './mail/digest.ts';
import { runNightly } from './maintenance.ts';
import { handleRequest } from './router.ts';
import { ensureSchema, runSetup, type SetupReport } from './setup.ts';

interface TextOutputFactory {
  ContentService: {
    MimeType: { JSON: unknown; ICAL: unknown };
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

function calendarText(body: string): unknown {
  const { ContentService } = globalThis as unknown as TextOutputFactory;
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.ICAL);
}

/**
 * GET: the personal calendar feed (`?action=ics&token=…`, F5), or the
 * health check that tells the portal (and a person with the URL) that the
 * API is up.
 */
export function doGet(e?: { parameter?: Record<string, string | undefined> }): unknown {
  const params = e?.parameter ?? {};
  if (params.action === 'ics') return calendarText(icsFeed(env(), params.token ?? ''));
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

/**
 * Run once from the editor (and after each update): creates whatever is
 * missing. First, if the owner left a permission out in Google's consent
 * window, Google ends this run and shows the window again.
 */
export function setup(): SetupReport {
  const e = env();
  requireAllScopes(e);
  const report = runSetup(e);
  console.log(
    [
      `Hoja: https://docs.google.com/spreadsheets/d/${report.spreadsheetId}`,
      report.created.length
        ? `Creado: ${report.created.join('; ')}`
        : 'Nada nuevo: todo estaba listo.',
      ...report.checked.map((c) => `Revisado: ${c}`),
      ...report.warnings.map((w) => `Aviso: ${w}`),
    ].join('\n'),
  );
  return report;
}

/** Daily time trigger (created by setup): backup and cleanup. */
export function nightly(): void {
  runNightly(env());
}

/** Hourly time trigger (created by setup): the daily summary, once, from its hour on. */
export function dailyDigest(): DigestReport {
  const e = env();
  ensureSchema(e);
  return runDigest(e);
}

/** Time trigger every 15 minutes (created by setup): the Google calendars. */
export function syncCalendars(): CalendarSyncReport {
  const e = env();
  ensureSchema(e);
  return runCalendarSync(e);
}
