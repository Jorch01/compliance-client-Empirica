/**
 * Runs the BUNDLED file in a sandbox that mimics Apps Script, so the tests
 * exercise what gets deployed, not the TypeScript sources.
 */
import { createContext, runInContext } from 'node:vm';
import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import { BUNDLE_OPTIONS, ENTRY_POINTS } from '../build.ts';

interface FakeTextOutput {
  content: string;
  mimeType?: string;
  setMimeType(type: string): FakeTextOutput;
}

let sandbox: Record<string, unknown>;

beforeAll(async () => {
  const result = await build({ ...BUNDLE_OPTIONS, write: false });
  const code = result.outputFiles[0]?.text ?? '';
  sandbox = {
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content: string): FakeTextOutput {
        return {
          content,
          setMimeType(type: string) {
            this.mimeType = type;
            return this;
          },
        };
      },
    },
  };
  createContext(sandbox);
  runInContext(code, sandbox, { filename: 'Code.js' });
});

describe('bundled Apps Script', () => {
  it.each(ENTRY_POINTS)('exposes %s as a top-level function', (name) => {
    expect(typeof sandbox[name]).toBe('function');
  });

  it.each(['doGet', 'doPost'] as const)('%s answers JSON with the server clock', (name) => {
    const fn = sandbox[name] as (e: unknown) => FakeTextOutput;
    const out = fn({ parameter: {} });
    expect(out.mimeType).toBe('application/json');
    const body = JSON.parse(out.content) as {
      ok: boolean;
      error: { code: string };
      serverNow: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('NOT_IMPLEMENTED');
    expect(Number.isNaN(Date.parse(body.serverNow))).toBe(false);
  });
});
