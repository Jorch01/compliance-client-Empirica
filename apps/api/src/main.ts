/**
 * Apps Script entry points. Apps Script calls these by name, so build.ts
 * exposes each export listed in ENTRY_POINTS as a top-level function of the
 * single bundled file.
 *
 * Phase 0: the contract is not implemented yet. Every call answers with a
 * clear error plus the server clock, which every response will carry (the
 * clients correct their own clocks with it before stamping edits).
 */

interface ApiError {
  ok: false;
  error: { code: string; message: string };
  serverNow: string;
}

function json(body: Omit<ApiError, 'serverNow'>): GoogleAppsScript.Content.TextOutput {
  const payload: ApiError = { ...body, serverNow: new Date().toISOString() };
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

const notImplemented = (): GoogleAppsScript.Content.TextOutput =>
  json({
    ok: false,
    error: { code: 'NOT_IMPLEMENTED', message: 'Empírica Portal API: pendiente de la fase 1.' },
  });

export function doGet(_e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  return notImplemented();
}

export function doPost(_e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  return notImplemented();
}
