/**
 * What clasp uploads and how Apps Script runs it: the project file points at
 * the bundle, and the manifest keeps the settings the backend relies on.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const API = join(import.meta.dirname, '..');
const json = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(API, name), 'utf8')) as Record<string, unknown>;

describe('deployment configuration', () => {
  it('clasp uploads the bundle, and only it, to the portal project', () => {
    const clasp = json('.clasp.json');
    expect(Object.keys(clasp).sort()).toEqual(['scriptId', 'srcDir']);
    expect(clasp.srcDir).toBe('build');
    expect(typeof clasp.scriptId === 'string' ? clasp.scriptId : '').toMatch(/^1[\w-]{40,}$/);
  });

  it('the manifest keeps the time zone, the web app settings and only the permissions it uses', () => {
    expect(json('appsscript.json')).toEqual({
      timeZone: 'America/Cancun',
      runtimeVersion: 'V8',
      exceptionLogging: 'STACKDRIVER',
      oauthScopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/script.external_request',
        'https://www.googleapis.com/auth/script.scriptapp',
      ],
      webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' },
    });
  });
});
