/**
 * What clasp uploads and how Apps Script runs it: the project file points at
 * the bundle, and the manifest keeps the settings the backend relies on. Then
 * how CI publishes it (deploy.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_VERSIONS,
  SERVICE,
  WARN_VERSIONS,
  checkHealth,
  decide,
  deploymentIdFrom,
  fingerprint,
  isHealthy,
  rollbackTarget,
  rolledBackMessage,
  versionRoom,
  webAppUrl,
} from '../deploy.ts';

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
        // F5: the Google calendars and the emails (the owner authorizes them once).
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/script.send_mail',
      ],
      dependencies: {
        enabledAdvancedServices: [{ userSymbol: 'Calendar', serviceId: 'calendar', version: 'v3' }],
      },
      webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' },
    });
  });
});

describe('publication (deploy.ts)', () => {
  const ID = 'AKfycbTest_deployment-1';

  it('goes back to the version it served when the new one does not answer', () => {
    expect(
      rollbackTarget({ deploymentId: ID, versionNumber: 7, description: 'abc1234 api:1' }),
    ).toEqual({
      versionNumber: 7,
      description: 'abc1234 api:1',
    });
    expect(rollbackTarget(undefined)).toBeNull();
    expect(rollbackTarget({ deploymentId: ID })).toBeNull();
    const message = rolledBackMessage(7, webAppUrl(ID), '<html>Authorization is required</html>');
    expect(message).toContain('volvió a la versión 7: el portal sigue funcionando');
    expect(message).toContain('ejecuta la función setup y acepta los permisos');
    expect(message).toContain('Authorization is required');
  });

  it('fingerprints the bundle: same files, same print; any change, another', () => {
    const print = fingerprint(['code', '{}']);
    expect(print).toMatch(/^api:[0-9a-f]{12}$/);
    expect(fingerprint(['code', '{}'])).toBe(print);
    expect(fingerprint(['code ', '{}'])).not.toBe(print);
    expect(fingerprint(['cod', 'e{}'])).not.toBe(print);
  });

  it('publishes a new version only when the deployment does not serve this bundle yet', () => {
    const print = fingerprint(['code', '{}']);
    const head = { deploymentId: 'AKfycbHead' };
    expect(decide([head], ID, print)).toEqual({ kind: 'missing' });
    // The first deployment, made by hand in the editor.
    expect(
      decide([head, { deploymentId: ID, versionNumber: 1, description: SERVICE }], ID, print),
    ).toEqual({ kind: 'changed' });
    expect(
      decide([{ deploymentId: ID, versionNumber: 7, description: `abc1234 ${print}` }], ID, print),
    ).toEqual({ kind: 'unchanged', versionNumber: 7 });
    expect(decide([{ deploymentId: ID, description: `abc1234 ${print}x` }], ID, print)).toEqual({
      kind: 'changed',
    });
  });

  it('stops at the 200-version limit and warns on the way', () => {
    expect(MAX_VERSIONS).toBe(200);
    expect(versionRoom(0)).toEqual({ ok: true });
    expect(versionRoom(WARN_VERSIONS - 2)).toEqual({ ok: true });
    expect(versionRoom(WARN_VERSIONS - 1)).toMatchObject({ ok: true, message: /180 de 200/ });
    expect(versionRoom(MAX_VERSIONS - 1)).toMatchObject({ ok: true, message: /200 de 200/ });
    expect(versionRoom(MAX_VERSIONS)).toMatchObject({
      ok: false,
      message: /Historial del proyecto/,
    });
  });

  it('checks the Web App at its fixed address, retrying while it warms up', async () => {
    expect(webAppUrl(ID)).toBe(`https://script.google.com/macros/s/${ID}/exec`);
    // The variable holds the ID; the whole address, pasted by mistake, works too.
    expect(deploymentIdFrom(` ${ID}\n`)).toBe(ID);
    expect(deploymentIdFrom(webAppUrl(ID))).toBe(ID);
    expect(deploymentIdFrom(`https://script.google.com/macros/s/${ID}/dev`)).toBe(ID);
    const healthy = JSON.stringify({ ok: true, data: { service: SERVICE, apiVersion: 1 } });
    expect(isHealthy(healthy)).toBe(true);
    expect(isHealthy('<html>Sign in</html>')).toBe(false);
    expect(isHealthy('null')).toBe(false);
    expect(isHealthy(JSON.stringify({ ok: false, data: { service: SERVICE } }))).toBe(false);

    const waits: number[] = [];
    const wait = (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    };
    const answers = ['<html>Error</html>', 'boom', healthy];
    const get = (url: string) => {
      expect(url).toBe(webAppUrl(ID));
      const next = answers.shift() ?? '';
      return next === 'boom' ? Promise.reject(new Error('timeout')) : Promise.resolve(next);
    };
    await expect(checkHealth(webAppUrl(ID), get, wait)).resolves.toEqual({
      ok: true,
      last: healthy,
    });
    expect(waits).toEqual([5_000, 10_000]);

    const down = await checkHealth(webAppUrl(ID), () => Promise.resolve('<html>x</html>'), wait, 2);
    expect(down).toEqual({ ok: false, last: '<html>x</html>' });
  });
});
