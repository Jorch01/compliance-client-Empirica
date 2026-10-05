/**
 * The mock API of `npm run dev:mock` (and of the browser tests): the real
 * backend (apps/api/src/router.ts) with simulated Google services and the
 * fictitious data set, running inside Vite's server. Every browser that
 * opens the portal talks to the same instance, so two windows behave like
 * two devices of a real deployment.
 *
 *   POST /mock-api/exec      the API, exactly as the Web App answers it
 *   GET  /mock-api/exec      ?action=ics&token=…: the personal calendar feed
 *   GET  /mock-api/users     demo users to sign in as
 *   POST /mock-api/token     an ID token for any e-mail, always verified
 *   GET  /mock-api/instance  changes when the server restarts (the browser wipes its copy)
 *   POST /mock-api/reset     a fresh data set (tests)
 *
 * Never part of a production build: Vite only loads it in mock mode.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import type { Connect, Plugin } from 'vite';

interface World {
  readonly env: unknown;
  google: { firebase: { issue(options: { uid: string; email: string }): string } };
  rows(name: string): Record<string, unknown>[];
}

interface Backend {
  world: World;
  handle(body: string): unknown;
  feed(token: string): string;
  instance: string;
}

async function start(apiSrc: string): Promise<Backend> {
  const load = (path: string): Promise<unknown> =>
    import(/* @vite-ignore */ pathToFileURL(`${apiSrc}/${path}`).href);
  const harness = (await load('testing/harness.ts')) as {
    createWorld(options: { now: () => number }): World;
  };
  const router = (await load('router.ts')) as {
    handleRequest(env: unknown, body: string): unknown;
  };
  const calendar = (await load('calendar/feed.ts')) as {
    icsFeed(env: unknown, token: string): string;
  };
  const world = harness.createWorld({ now: () => Date.now() });
  return {
    world,
    handle: (body) => router.handleRequest(world.env, body),
    feed: (token) => calendar.icsFeed(world.env, token),
    instance: randomUUID(),
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** `apiSrc`: absolute path of apps/api/src. */
export function mockApi(apiSrc: string): Plugin {
  let backend: Promise<Backend> | null = null;
  const get = (): Promise<Backend> => (backend ??= start(apiSrc));

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/mock-api/')) {
      next();
      return;
    }
    void (async () => {
      try {
        const route = `${req.method ?? 'GET'} ${url.split('?')[0] ?? ''}`;
        if (route === 'POST /mock-api/reset') {
          backend = null;
          send(res, 200, { instance: (await get()).instance });
          return;
        }
        const b = await get();
        switch (route) {
          case 'POST /mock-api/exec':
            send(res, 200, b.handle(await readBody(req)));
            return;
          case 'GET /mock-api/exec': {
            const params = new URLSearchParams(url.split('?')[1] ?? '');
            if (params.get('action') !== 'ics') {
              send(res, 404, { error: 'not found' });
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(b.feed(params.get('token') ?? ''));
            return;
          }
          case 'GET /mock-api/instance':
            send(res, 200, { instance: b.instance });
            return;
          case 'GET /mock-api/users':
            send(
              res,
              200,
              b.world
                .rows('Usuarios')
                .filter((u) => u.estado === 'ACTIVO' && !u.deleted)
                .map((u) => ({
                  id: u.id,
                  email: u.email,
                  nombre: u.nombre,
                  lado: u.lado,
                  rolBase: u.rolBase,
                })),
            );
            return;
          case 'POST /mock-api/token': {
            const { email } = JSON.parse((await readBody(req)) || '{}') as { email?: unknown };
            const address = text(email).trim().toLowerCase();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
              send(res, 400, { error: 'email' });
              return;
            }
            const known = b.world.rows('Usuarios').find((u) => u.email === address);
            // The same account for the same e-mail, as Firebase would give.
            const uid = `fb-${address}`;
            send(res, 200, {
              token: b.world.google.firebase.issue({ uid, email: address }),
              uid,
              email: address,
              nombre: known ? text(known.nombre) : null,
            });
            return;
          }
          default:
            send(res, 404, { error: 'not found' });
        }
      } catch (error) {
        send(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  };

  return {
    name: 'empirica-mock-api',
    configureServer: (server) => {
      server.middlewares.use(handler);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(handler);
    },
  };
}
