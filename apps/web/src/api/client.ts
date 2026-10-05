/**
 * The one way the browser talks to the backend (PLAN.md § 7): POST with a
 * text/plain body (no CORS preflight), following Apps Script's redirect, and
 * the outcome always in the envelope. Network trouble and API errors become
 * two different errors, so the sync engine can tell "offline" from "refused".
 */
import { ERROR_MESSAGES, type Action, type ApiResponse, type ErrorCode } from '@empirica/shared';
import { API_URL, APP_VERSION } from '../config/api.ts';

/** The request never reached the backend, or its answer never came back. */
export class NetworkError extends Error {
  constructor(message = 'Sin conexión con el servidor') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** The backend answered, and said no. */
export class ApiCallError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;
  readonly serverNow: string | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    serverNow?: string,
  ) {
    super(message);
    this.name = 'ApiCallError';
    this.code = code;
    this.details = details;
    this.serverNow = serverNow;
  }

  /** `details.reason`, when the backend gave one. */
  get reason(): string | undefined {
    return typeof this.details.reason === 'string' ? this.details.reason : undefined;
  }
}

export interface CallResult<T> {
  data: T;
  serverNow: string;
}

const DEVICE_KEY = 'empirica.deviceId';

/** A stable id for this browser, sent as `clientId` (helps reading the audit log). */
export function deviceId(): string {
  try {
    const known = localStorage.getItem(DEVICE_KEY);
    if (known) return known;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return 'sin-almacenamiento';
  }
}

/** The readable start of an answer that is not the envelope, without its markup. */
function excerpt(body: string): string {
  return body
    .slice(0, 20_000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/** Actions that carry a whole file: they may take minutes on a slow network. */
const FILE_ACTIONS: ReadonlySet<Action> = new Set([
  'files.upload',
  'files.download',
  'reports.send',
  'reports.download',
]);

export interface CallOptions {
  idToken?: string | null;
  /** Gives up after this long (Apps Script can take a few seconds; a file, minutes). */
  timeoutMs?: number;
  url?: string;
  fetchImpl?: typeof fetch;
}

export async function callApi<T>(
  action: Action,
  payload: unknown,
  options: CallOptions = {},
): Promise<CallResult<T>> {
  const url = options.url ?? API_URL;
  if (!url) throw new NetworkError('El portal no tiene configurada la dirección del servidor');
  const body = JSON.stringify({
    v: 1,
    action,
    payload,
    requestId: crypto.randomUUID(),
    clientId: deviceId(),
    appVersion: APP_VERSION,
    userAgent: navigator.userAgent.slice(0, 400),
    ...(options.idToken ? { idToken: options.idToken } : {}),
  });

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: 'POST',
      // text/plain keeps the request "simple": no preflight, which Apps Script cannot answer.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      credentials: 'omit',
      signal: AbortSignal.timeout(
        options.timeoutMs ?? (FILE_ACTIONS.has(action) ? 300_000 : 45_000),
      ),
    });
  } catch (error) {
    throw new NetworkError(error instanceof Error ? error.message : undefined);
  }
  let answer = '';
  let envelope: ApiResponse<T> | undefined;
  try {
    answer = await response.text();
    envelope = JSON.parse(answer) as ApiResponse<T>;
  } catch {
    /* not JSON: see below */
  }
  if (typeof envelope?.ok !== 'boolean') {
    // Google's own pages (an outage, a quota, a permission the owner has to
    // grant) are HTML, not our envelope: their first words tell which.
    const start = excerpt(answer);
    throw new NetworkError(
      `Respuesta inesperada del servidor (${String(response.status)})${start ? `: ${start}` : ''}`,
    );
  }
  if (!envelope.ok) {
    const { code, message, details } = envelope.error;
    throw new ApiCallError(
      code,
      message || ERROR_MESSAGES[code],
      details ?? {},
      envelope.serverNow,
    );
  }
  return { data: envelope.data, serverNow: envelope.serverNow };
}
