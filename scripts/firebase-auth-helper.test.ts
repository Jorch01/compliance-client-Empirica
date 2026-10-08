/**
 * The copy of Firebase's sign-in helper (D78). It only runs in the
 * publication, against Firebase's domain, so here a fake network answers.
 */
import { describe, expect, it } from 'vitest';
import { FIREBASE_DOMAIN, FIREBASE_PROJECT } from '../apps/web/src/config/firebase-project.ts';
import {
  HELPER_FILES,
  collect,
  copyPlan,
  fetchChecked,
  missingScripts,
  problemWith,
  type Fetched,
  type Get,
  type HelperFile,
} from './firebase-auth-helper.ts';

const file = (path: string): HelperFile => {
  const found = HELPER_FILES.find((f) => f.path === path);
  if (!found) throw new Error(path);
  return found;
};
const HANDLER = file('__/auth/handler');
const HANDLER_JS = file('__/auth/handler.js');
const INIT = file('__/firebase/init.json');

const answer = (body: string, type: string, status = 200): Fetched => ({
  status,
  type,
  bytes: new TextEncoder().encode(body),
});
const page = (...scripts: string[]): Fetched =>
  answer(
    `<!DOCTYPE html><html><head>${scripts.map((s) => `<script src="${s}"></script>`).join('')}</head><body></body></html>`,
    'text/html; charset=utf-8',
  );
const code = (): Fetched => answer(`(function(){${'var a=1;'.repeat(200)}})();`, 'text/javascript');
const config = (projectId: string = FIREBASE_PROJECT.projectId): Fetched =>
  answer(
    JSON.stringify({ apiKey: 'k', authDomain: FIREBASE_DOMAIN, projectId }),
    'application/json',
  );

/** Firebase's domain, as it answers today. */
function firebase(overrides: Record<string, Fetched | Error> = {}): Get {
  const site: Record<string, Fetched | Error> = {
    '__/auth/handler': page('/__/auth/experiments.js', '/__/auth/handler.js'),
    '__/auth/handler.js': code(),
    '__/auth/experiments.js': answer('', 'text/javascript'),
    '__/auth/iframe': page('/__/auth/iframe.js', 'https://apis.google.com/js/api.js'),
    '__/auth/iframe.js': code(),
    '__/auth/links': page('/__/auth/links.js'),
    '__/auth/links.js': code(),
    '__/firebase/init.json': config(),
    ...overrides,
  };
  return (url) => {
    const prefix = `https://${FIREBASE_DOMAIN}/`;
    const got = url.startsWith(prefix) ? site[url.slice(prefix.length)] : undefined;
    if (got instanceof Error) return Promise.reject(got);
    return Promise.resolve(got ?? answer('Not found', 'text/html', 404));
  };
}
const noWait = (): Promise<void> => Promise.resolve();

describe('what counts as each helper file', () => {
  it('a page that loads its code, code that is not a page, this project’s configuration', () => {
    expect(problemWith(HANDLER, page('/__/auth/handler.js'))).toBeNull();
    expect(problemWith(HANDLER_JS, code())).toBeNull();
    expect(problemWith(INIT, config())).toBeNull();
  });

  it('an error, an empty answer, a page without code or served as something else', () => {
    expect(problemWith(HANDLER, answer('Not found', 'text/html', 404))).toBe('respondió 404');
    expect(problemWith(HANDLER_JS, answer('', 'text/javascript'))).toBe('trae 0 bytes');
    expect(problemWith(HANDLER, answer(`<html>${'x'.repeat(80)}</html>`, 'text/html'))).toBe(
      'la página no carga ningún código',
    );
    expect(
      problemWith(HANDLER, { ...page('/__/auth/handler.js'), type: 'application/octet-stream' }),
    ).toMatch(/no es una página/);
  });

  it('an error page where code was expected, or another project’s configuration', () => {
    expect(
      problemWith(HANDLER_JS, answer(`<!DOCTYPE html>${'x'.repeat(2_000)}`, 'text/html')),
    ).toBe('trae una página en lugar de código');
    expect(problemWith(INIT, config('otro-proyecto'))).toBe(
      'no es la configuración de este proyecto',
    );
    expect(problemWith(INIT, answer('{nope', 'application/json'))).toBe('no es JSON');
  });
});

describe('the scripts a helper page loads', () => {
  it('from its own domain, all in the copy; Google’s own are not copied', () => {
    expect(missingScripts(HANDLER, '<script src="/__/auth/handler.js"></script>')).toEqual([]);
    expect(missingScripts(HANDLER, "<script async src='handler.js'></script>")).toEqual([]);
    expect(
      missingScripts(HANDLER, '<script src="https://apis.google.com/js/api.js"></script>'),
    ).toEqual([]);
  });

  it('a new file of Firebase’s is caught', () => {
    expect(missingScripts(HANDLER, '<script src="/__/auth/new.js"></script>')).toEqual([
      '__/auth/new.js',
    ]);
  });
});

describe('asking Firebase’s domain', () => {
  it('asks again after a bad answer, a little later each time', async () => {
    const waits: number[] = [];
    let calls = 0;
    const flaky: Get = () => {
      calls += 1;
      return calls < 3 ? Promise.reject(new Error('ECONNRESET')) : Promise.resolve(code());
    };
    const result = await fetchChecked(HANDLER_JS, 'u', flaky, (ms) => {
      waits.push(ms);
      return Promise.resolve();
    });
    expect(result.ok).toBe(true);
    expect(waits).toEqual([3_000, 6_000]);
  });

  it('gives up with the last problem', async () => {
    const result = await fetchChecked(
      HANDLER,
      `https://${FIREBASE_DOMAIN}/__/auth/handler`,
      firebase({ '__/auth/handler': answer('', 'text/html', 503) }),
      noWait,
    );
    expect(result).toEqual({ ok: false, problem: 'respondió 503' });
  });
});

describe('the copy', () => {
  it('every file Firebase lists, pages saved as .html for GitHub Pages', async () => {
    const copy = await collect(firebase(), noWait, 'key');
    expect(copy.problems).toEqual([]);
    expect(copy.files.map((f) => f.saveAs)).toEqual([
      '__/auth/handler.html',
      '__/auth/handler.js',
      '__/auth/experiments.js',
      '__/auth/iframe.html',
      '__/auth/iframe.js',
      '__/auth/links.html',
      '__/auth/links.js',
      '__/firebase/init.json',
    ]);
    // The log says what each page loads, never the key.
    expect(copy.lines.join('\n')).toContain(
      '__/auth/iframe carga: /__/auth/iframe.js, https://apis.google.com/js/api.js',
    );
    expect(copy.lines.join('\n')).not.toContain('key');
  });

  it('without init.json on Firebase’s domain, it is written with the portal’s configuration', async () => {
    const copy = await collect(
      firebase({ '__/firebase/init.json': answer('Not found', 'text/html', 404) }),
      noWait,
      'browser-key',
    );
    expect(copy.problems).toEqual([]);
    const init = copy.files.find((f) => f.saveAs === '__/firebase/init.json');
    expect(JSON.parse(new TextDecoder().decode(init?.bytes))).toEqual({
      apiKey: 'browser-key',
      authDomain: FIREBASE_DOMAIN,
      ...FIREBASE_PROJECT,
    });
  });

  it('the pages of email links are not needed to sign in with Google: without them it goes on', async () => {
    const copy = await collect(
      firebase({ '__/auth/links': answer('Not found', 'text/html', 404) }),
      noWait,
      'key',
    );
    expect(copy.problems).toEqual([]);
    expect(copy.files.map((f) => f.saveAs)).not.toContain('__/auth/links.html');
    expect(copy.lines).toContain(
      '__/auth/links: respondió 404; no hace falta para entrar con Google',
    );
  });

  it('a missing page, or one that loads a file the copy lacks, is a problem', async () => {
    const copy = await collect(
      firebase({
        '__/auth/iframe': new Error('getaddrinfo ENOTFOUND'),
        '__/auth/handler': page('/__/auth/handler.js', '/__/auth/new.js'),
        '__/firebase/init.json': answer('Not found', 'text/html', 404),
      }),
      noWait,
      '',
    );
    expect(copy.problems).toEqual([
      '__/auth/handler carga __/auth/new.js, que no está en la copia (agrégalo a HELPER_FILES)',
      `https://${FIREBASE_DOMAIN}/__/auth/iframe getaddrinfo ENOTFOUND`,
      `https://${FIREBASE_DOMAIN}/__/firebase/init.json respondió 404`,
    ]);
  });
});

describe('when the copy is in use', () => {
  it('only once the variable names the domain the site is published on', () => {
    expect(copyPlan(undefined, 'portal.empirica.mx')).toEqual({
      authDomain: FIREBASE_DOMAIN,
      inUse: false,
      mismatch: null,
    });
    expect(copyPlan('portal.empirica.mx', 'portal.empirica.mx')).toEqual({
      authDomain: 'portal.empirica.mx',
      inUse: true,
      mismatch: null,
    });
    expect(copyPlan('https://portal.empirica.mx/', 'portal.empirica.mx').mismatch).toBeNull();
  });

  it('another domain stops the publication', () => {
    expect(copyPlan('empirica.mx', 'portal.empirica.mx').mismatch).toMatch(
      /dice empirica\.mx, pero el portal se publica en portal\.empirica\.mx/,
    );
  });
});
