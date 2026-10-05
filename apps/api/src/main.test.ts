/**
 * Runs the BUNDLED file (what clasp uploads) in a sandbox with the fake
 * Google services, so the tests exercise what gets deployed: the top-level
 * entry points, setup(), and real requests through doPost.
 */
import { createContext, runInContext } from 'node:vm';
import type { ApiResponse, BootstrapData, PullData } from '@empirica/shared';
import { ID, demoData } from '@empirica/shared/testing';
import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import { BUNDLE_OPTIONS, ENTRY_POINTS } from '../build.ts';
import { isHealthy } from '../deploy.ts';
import { PROP, createEnv } from './env.ts';
import { FakeGoogle } from './testing/google.ts';
import { seed } from './testing/harness.ts';

interface TextOutput {
  content: string;
  mimeType: string;
}

let sandbox: Record<string, unknown>;
let google: FakeGoogle;
let code = '';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the result it expects
const call = <T>(fn: string, ...args: unknown[]): T =>
  (sandbox[fn] as (...a: unknown[]) => T)(...args);

function post<T>(body: unknown): ApiResponse<T> {
  const out = call<TextOutput>('doPost', { postData: { contents: JSON.stringify(body) } });
  expect(out.mimeType).toBe('application/json');
  return JSON.parse(out.content) as ApiResponse<T>;
}

beforeAll(async () => {
  const result = await build({ ...BUNDLE_OPTIONS, write: false });
  code = result.outputFiles[0]?.text ?? '';
  google = new FakeGoogle(() => Date.now());
  google.props.set(PROP.firebaseProjectId, google.firebase.projectId);
  google.props.set(PROP.firebaseApiKey, google.firebase.apiKey);
  sandbox = { ...google.globals };
  createContext(sandbox);
  runInContext(code, sandbox, { filename: 'Code.js' });
});

describe('bundled Apps Script', () => {
  it.each(ENTRY_POINTS)('exposes %s as a top-level function', (name) => {
    expect(typeof sandbox[name]).toBe('function');
  });

  it('carries no Node APIs and no secrets', () => {
    expect(code).not.toMatch(/require\(["']node:|process\.env|Buffer\./);
    expect(code).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });

  it('doGet answers a health check with the server clock', () => {
    const out = call<TextOutput>('doGet', { parameter: {} });
    const body = JSON.parse(out.content) as {
      ok: boolean;
      data: { apiVersion: number };
      serverNow: string;
    };
    expect(body).toMatchObject({ ok: true, data: { apiVersion: 1 } });
    expect(body.serverNow).toMatch(/-05:00$/);
    // What CI checks after each publication.
    expect(isHealthy(out.content)).toBe(true);
  });

  it('setup() creates the database from inside the bundle', () => {
    // With a permission left out in Google's window, the editor asks again first.
    google.grantedScopes.delete('https://www.googleapis.com/auth/script.send_mail');
    expect(() => call('setup')).toThrow(/Authorization is required/);
    expect(google.spreadsheets.size).toBe(0);
    google.grantedScopes.add('https://www.googleapis.com/auth/script.send_mail');
    const report = call<{ created: string[] }>('setup');
    expect(report.created).toContain('hoja EMPIRICA_PORTAL_DB');
    expect(google.spreadsheet().getSheets().length).toBeGreaterThan(20);
  });

  it('serves real requests: ping, bootstrap and a filtered pull', () => {
    seed(
      createEnv(google.globals, () => Date.now()),
      demoData(),
    );
    expect(post({ v: 1, action: 'ping' })).toMatchObject({ ok: true, data: { pong: true } });

    const token = google.firebase.issue({ uid: 'fb-colab', email: 'norte@cliente-a.example' });
    const boot = post<BootstrapData>({ v: 1, action: 'session.bootstrap', idToken: token });
    expect(boot).toMatchObject({
      ok: true,
      data: { clients: [{ id: ID.clienteA, rol: 'CLIENTE_COLABORADOR' }] },
    });

    const pulled = post<PullData>({
      v: 1,
      action: 'sync.pull',
      idToken: token,
      payload: { cursor: 0 },
    });
    if (!pulled.ok) throw new Error(pulled.error.message);
    expect(pulled.data.changes.length).toBeGreaterThan(5);
    expect(pulled.data.changes.filter((c) => c.row.visibilidad === 'INTERNO')).toEqual([]);
    expect(pulled.data.changes.filter((c) => c.row.clienteId === ID.clienteB)).toEqual([]);
  });

  it('serves the personal calendar feed as text/calendar, and runs the F5 triggers', () => {
    const token = google.firebase.issue({ uid: 'fb-colab', email: 'norte@cliente-a.example' });
    const sub = post<{ token: string }>({
      v: 1,
      action: 'calendar.subscribe',
      idToken: token,
      payload: {},
    });
    if (!sub.ok) throw new Error(sub.error.message);
    const feed = call<TextOutput>('doGet', { parameter: { action: 'ics', token: sub.data.token } });
    expect(feed.mimeType).toBe('text/calendar');
    expect(feed.content).toContain('BEGIN:VEVENT');
    const nobody = call<TextOutput>('doGet', { parameter: { action: 'ics', token: 'x' } });
    expect(nobody.content).toContain('END:VCALENDAR');
    expect(nobody.content).not.toContain('BEGIN:VEVENT');
    // The triggers' entry points work inside the bundle too.
    expect(call<{ skipped: string | null; failed: number }>('syncCalendars')).toMatchObject({
      skipped: null,
      failed: 0,
    });
    expect(call<{ failed: number }>('dailyDigest')).toMatchObject({ failed: 0 });
  });

  it('answers errors in the envelope, never with an exception', () => {
    const res = post({ v: 1, action: 'sync.pull', payload: { cursor: 0 } });
    expect(res).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    const out = call<TextOutput>('doPost', { postData: { contents: '{roto' } });
    expect(JSON.parse(out.content)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    const empty = call<TextOutput>('doPost', undefined);
    expect(JSON.parse(empty.content)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });
});
