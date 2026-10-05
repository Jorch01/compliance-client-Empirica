/**
 * A whole backend in memory for the tests: fake Google services, setup()
 * already run, the fictitious data set loaded, and helpers to call the API as
 * any of its users.
 */
import {
  TABLES,
  TABLE_NAMES,
  text,
  type Action,
  type ApiResponse,
  type Row,
} from '@empirica/shared';
import {
  DEMO_FILE_CONTENT,
  DEMO_REPORT_PDF,
  demoData,
  type Dataset,
} from '@empirica/shared/testing';
import { Database, Sequence } from '../db/database.ts';
import { PROP, createEnv, type Env } from '../env.ts';
import { handleRequest } from '../router.ts';
import { runSetup } from '../setup.ts';
import { FakeGoogle } from './google.ts';

export const START = '2026-10-02T12:00:00.000-05:00';

/** Loads rows as they are, numbering each one in turn. */
export function seed(env: Env, data: Partial<Dataset>): void {
  const db = new Database(env);
  const seq = new Sequence(env);
  for (const name of TABLE_NAMES) {
    for (const row of data[name] ?? []) {
      const n = seq.next();
      db.table(name).put({
        ...row,
        serverSeq: TABLES[name].sync === 'none' ? null : n,
        seqAlta: n,
      });
    }
  }
  seq.reserve();
  db.flush();
  seq.commit();
}

export interface CallOptions {
  /** User id from the data set; a token is issued for them. */
  as?: string;
  token?: string;
  appVersion?: string;
  userAgent?: string;
}

export function createWorld(
  options: {
    data?: Dataset | null;
    adminEmails?: string;
    /** A clock that runs (the mock API of the web app); by default it stands at START. */
    now?: () => number;
  } = {},
) {
  const base = options.now ?? (() => Date.parse(START));
  let offset = 0;
  const clock = {
    now: () => base() + offset,
    advance: (ms: number) => {
      offset += ms;
    },
    set: (iso: string) => {
      offset = Date.parse(iso) - base();
    },
  };
  const google = new FakeGoogle(clock.now);
  google.props.set(PROP.firebaseProjectId, google.firebase.projectId);
  google.props.set(PROP.firebaseApiKey, google.firebase.apiKey);
  google.props.set(PROP.geminiKey, google.gemini.apiKey);
  if (options.adminEmails) google.props.set(PROP.adminEmails, options.adminEmails);
  // Production builds a new Env for every request (and so re-reads the
  // properties); the tests do the same.
  const freshEnv = (): Env => createEnv(google.globals, clock.now);
  const env = freshEnv();
  const setupReport = runSetup(env);
  // setup() tries the server key and the Gemini key once; the tests count only their own calls.
  google.firebase.lookups = 0;
  google.gemini.listCalls = 0;
  const data = options.data === null ? null : (options.data ?? demoData());
  if (data) {
    seed(env, data);
    // The demo documents' files are in Drive too, so they can be downloaded.
    for (const doc of data.Documentos) {
      const fileId = text(doc, 'driveFileId');
      if (fileId) {
        google.seedFile(
          fileId,
          text(doc, 'nombre') ?? 'documento',
          DEMO_FILE_CONTENT,
          text(doc, 'mimeType') ?? 'application/octet-stream',
        );
      }
    }
    // And the PDF of each report already sent.
    for (const report of data.Reportes) {
      const pdfId = text(report, 'pdfId');
      if (pdfId) {
        google.seedFile(
          pdfId,
          `Reporte ${text(report, 'periodo') ?? ''}.pdf`,
          DEMO_REPORT_PDF,
          'application/pdf',
        );
      }
    }
  }

  // Tokens last an hour, like Firebase's; a new one is issued when needed.
  const tokens = new Map<string, { token: string; exp: number }>();
  const tokenFor = (userId: string): string => {
    const cached = tokens.get(userId);
    if (cached && cached.exp - 60_000 > clock.now()) return cached.token;
    const user = new Database(freshEnv()).table('Usuarios').get(userId);
    if (!user || typeof user.email !== 'string') throw new Error(`No user ${userId}`);
    const token = google.firebase.issue({ uid: `fb-${userId}`, email: user.email });
    tokens.set(userId, { token, exp: clock.now() + 3_600_000 });
    return token;
  };

  let requests = 0;
  function call<T>(action: string, payload: unknown = {}, opts: CallOptions = {}): ApiResponse<T> {
    const idToken = opts.token ?? (opts.as ? tokenFor(opts.as) : undefined);
    const body = JSON.stringify({
      v: 1,
      action,
      payload,
      requestId: `req-${++requests}`,
      ...(idToken ? { idToken } : {}),
      ...(opts.appVersion ? { appVersion: opts.appVersion } : {}),
      ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
    });
    return JSON.parse(JSON.stringify(handleRequest(freshEnv(), body))) as ApiResponse<T>;
  }

  /** Calls and returns the data, failing the test on an error envelope. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the payload it expects
  function ok<T>(action: Action, payload: unknown, opts: CallOptions): T {
    const res = call<T>(action, payload, opts);
    if (!res.ok) throw new Error(`${action} failed: ${res.error.code} ${res.error.message}`);
    return res.data;
  }

  const rows = (name: (typeof TABLE_NAMES)[number]): Row[] => new Database(freshEnv()).rows(name);
  const row = (name: (typeof TABLE_NAMES)[number], id: string): Row | undefined =>
    new Database(freshEnv()).table(name).get(id);

  /** Edits rows directly in the sheet, as an administrator would by hand. */
  const edit = (
    name: (typeof TABLE_NAMES)[number],
    id: string,
    fields: Record<string, unknown>,
  ): void => {
    const db = new Database(freshEnv());
    const current = db.table(name).get(id);
    if (!current) throw new Error(`No ${name} ${id}`);
    db.table(name).put({ ...current, ...(fields as Row) });
    db.flush();
  };

  return {
    get env(): Env {
      return freshEnv();
    },
    google,
    clock,
    call,
    ok,
    tokenFor,
    rows,
    row,
    edit,
    setupReport,
  };
}

export type World = ReturnType<typeof createWorld>;
