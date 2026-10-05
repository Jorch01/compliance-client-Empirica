/**
 * The mock API of `npm run dev:mock` (and of the browser tests): the real
 * backend (apps/api/src/router.ts) with simulated Google services and the
 * fictitious data set, running inside Vite's server. Every browser that
 * opens the portal talks to the same instance, so two windows behave like
 * two devices of a real deployment.
 *
 *   POST /mock-api/exec      the API, exactly as the Web App answers it
 *   GET  /mock-api/exec      ?action=ics&token=…: the personal calendar feed
 *   GET  /mock-api/correos   the emails the portal would have sent (a page to look at)
 *   POST /mock-api/correos/resumen   today's daily summary, now
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

interface SentMail {
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  name?: string;
  replyTo?: string;
  /** The monthly report's PDF, as the test double keeps it (F6). */
  attachments?: { name: string | null; contentType: string | null; size: number }[];
}

interface World {
  readonly env: unknown;
  google: {
    firebase: { issue(options: { uid: string; email: string }): string };
    mail: { sent: SentMail[]; quota: number };
  };
  rows(name: string): Record<string, unknown>[];
}

interface Backend {
  world: World;
  handle(body: string): unknown;
  feed(token: string): string;
  digest(): unknown;
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
  const mail = (await load('mail/digest.ts')) as {
    runDigest(env: unknown, options: { force?: boolean }): unknown;
  };
  const world = harness.createWorld({ now: () => Date.now() });
  return {
    world,
    handle: (body) => router.handleRequest(world.env, body),
    feed: (token) => calendar.icsFeed(world.env, token),
    digest: () => mail.runDigest(world.env, { force: true }),
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

const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The emails sent so far, newest first, each as it would arrive (in a sandboxed frame). */
function mailPage(sent: readonly SentMail[], quota: number, note: string): string {
  const items = [...sent]
    .reverse()
    .map(
      (m) => `<article>
  <p><strong>${escape(m.subject)}</strong></p>
  <p>Para: ${escape(m.to)}${m.replyTo ? ` · Responder a: ${escape(m.replyTo)}` : ''}${m.name ? ` · De: ${escape(m.name)}` : ''}</p>
  ${(m.attachments ?? []).map((a) => `<p>Adjunto: ${escape(a.name ?? 'archivo')} (${escape(a.contentType ?? '')}, ${String(Math.round(a.size / 1024))} KB)</p>`).join('')}
  ${m.htmlBody ? `<iframe sandbox="" title="${escape(m.subject)}" srcdoc="${escape(m.htmlBody)}"></iframe>` : `<pre>${escape(m.body)}</pre>`}
</article>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Correos del modo de demostración</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { max-width: 760px; margin: 0 auto; padding: 16px; line-height: 1.5; }
  article { border-top: 1px solid; padding: 12px 0; }
  iframe { width: 100%; height: 560px; border: 1px solid; background: white; }
  pre { white-space: pre-wrap; }
</style>
</head>
<body>
<h1>Correos del modo de demostración</h1>
<p>Lo que el portal habría mandado desde que arrancó este servidor: el resumen diario, las invitaciones y los reportes mensuales. Nada sale de aquí. Quedan ${String(quota)} destinatarios de 100.</p>
${note ? `<p role="status">${escape(note)}</p>` : ''}
<form method="post" action="/mock-api/correos/resumen"><button type="submit">Generar el resumen de hoy</button></form>
${items || '<p>Todavía no hay correos.</p>'}
</body>
</html>`;
}

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
          case 'GET /mock-api/correos': {
            const note = url.includes('enviados=')
              ? `Resumen: ${decodeURIComponent(url.split('enviados=')[1] ?? '')}`
              : '';
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(mailPage(b.world.google.mail.sent, b.world.google.mail.quota, note));
            return;
          }
          case 'POST /mock-api/correos/resumen': {
            const report = b.digest() as { sent?: number; empty?: number };
            res.statusCode = 303;
            res.setHeader(
              'Location',
              `/mock-api/correos?enviados=${encodeURIComponent(`${String(report.sent ?? 0)} enviados, ${String(report.empty ?? 0)} sin nada que contar`)}`,
            );
            res.end();
            return;
          }
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
