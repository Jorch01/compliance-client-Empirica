/**
 * What an error report carries, if the user agrees (they see it before
 * sending): the version, the screen, the browser, the sync status and the
 * last errors the page noticed. Never their data or their clients'.
 */
import type { JsonValue } from '@empirica/shared';
import { APP_VERSION } from '../config/api.ts';
import { currentLanguage } from '../i18n/index.ts';
import { isInstalled } from '../portal/install.ts';
import type { SyncStatus } from '../sync/engine.ts';
import { themePreference } from '../theme.ts';

interface SeenError {
  message: string;
  at: string;
  where?: string;
}

const MAX_ERRORS = 5;
const seen: SeenError[] = [];

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  // JSON.stringify returns undefined for these, whatever its declared type says.
  if (error === undefined || typeof error === 'function' || typeof error === 'symbol') {
    return 'Error';
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Error';
  }
}

/** Keeps a short note of an error (the last five), for a report the user may send. */
export function recordError(error: unknown, where?: string): void {
  seen.push({
    message: describe(error).slice(0, 300),
    at: new Date().toISOString(),
    ...(where ? { where: where.slice(0, 300) } : {}),
  });
  while (seen.length > MAX_ERRORS) seen.shift();
}

/** Called once at startup: errors nobody caught are noted too. */
export function captureErrors(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    recordError(
      event.error ?? event.message,
      event.filename ? `${event.filename}:${String(event.lineno)}` : undefined,
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordError(event.reason);
  });
  // Something the security policy refused (src/security/csp.ts): say what, and from where.
  document.addEventListener('securitypolicyviolation', (event) => {
    const origin = /^https?:/.test(event.blockedURI)
      ? new URL(event.blockedURI).origin
      : event.blockedURI;
    recordError(`CSP ${event.effectiveDirective}: ${origin || 'inline'}`, event.sourceFile);
  });
}

export function diagnostics(sync: SyncStatus, route: string): Record<string, JsonValue> {
  return {
    version: APP_VERSION,
    ruta: route,
    navegador: navigator.userAgent.slice(0, 300),
    ventana: `${String(window.innerWidth)}x${String(window.innerHeight)}`,
    idioma: currentLanguage(),
    tema: themePreference(),
    instalada: isInstalled(),
    sincronizacion: {
      fase: sync.phase,
      pendientes: sync.pending,
      ultima: sync.lastSyncAt ? new Date(sync.lastSyncAt).toISOString() : null,
      error: sync.error?.code ?? null,
    },
    errores: seen.map((e) => ({ ...e })),
  };
}
