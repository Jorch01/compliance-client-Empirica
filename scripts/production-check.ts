#!/usr/bin/env node
/**
 * The published portal, checked the way a person uses it (workflow "Portal
 * publicado": every day and on demand). A browser with nothing stored opens
 * the portal, tries to sign in with an e-mail that has no account (Firebase
 * must answer "wrong credentials") and with Google (Google's page must
 * open, without redirect_uri_mismatch), and asks the server for its health.
 * It never signs in for real and needs no secret: it only proves every
 * piece answers, and says which one does not and what it said.
 *
 *   node scripts/production-check.ts [https://portal.empirica.mx/]
 */
import { chromium, type Page, type Response } from '@playwright/test';

const SITE = process.argv[2] ?? 'https://portal.empirica.mx/';
const DEPLOYMENT_ID = (process.env.APPS_SCRIPT_DEPLOYMENT_ID ?? '').trim();
const NOBODY = 'comprobacion-diaria@example.com';
const WAIT_MS = 30_000;

interface Result {
  check: string;
  ok: boolean;
  detail: string;
}
const results: Result[] = [];
const record = (check: string, ok: boolean, detail: string): void => {
  results.push({ check, ok, detail });
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${check}: ${detail}`);
};

/** What Firebase answered to a sign-in call: its error code, or "ok". */
async function firebaseAnswer(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } } | null;
    return body?.error?.message ?? `HTTP ${String(res.status())}`;
  } catch {
    return `HTTP ${String(res.status())}`;
  }
}

async function signInPage(page: Page): Promise<boolean> {
  try {
    await page.goto(SITE, { waitUntil: 'load', timeout: WAIT_MS });
    await page.getByRole('heading', { level: 1, name: 'Inicia sesión' }).waitFor({
      timeout: WAIT_MS,
    });
    record('Página de entrada', true, 'carga y muestra «Inicia sesión»');
    return true;
  } catch (error) {
    const heading = await page
      .locator('h1')
      .first()
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    record(
      'Página de entrada',
      false,
      `no apareció «Inicia sesión» (título visible: ${heading ?? 'ninguno'}): ${String(error).slice(0, 200)}`,
    );
    return false;
  }
}

async function emailAndPassword(page: Page): Promise<void> {
  const answer = page.waitForResponse((r) => r.url().includes('accounts:signInWithPassword'), {
    timeout: WAIT_MS,
  });
  await page.getByLabel('Correo electrónico').fill(NOBODY);
  await page.getByLabel('Contraseña', { exact: true }).fill('no-es-una-contrasena-1');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  let code: string;
  try {
    code = await firebaseAnswer(await answer);
  } catch {
    const alert = await page
      .getByRole('alert')
      .first()
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    record(
      'Correo y contraseña',
      false,
      `Firebase no recibió la petición en ${String(WAIT_MS / 1000)} s (aviso en pantalla: ${alert ?? 'ninguno'})`,
    );
    return;
  }
  const expected = /INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD/.test(code);
  record(
    'Correo y contraseña',
    expected,
    expected
      ? `Firebase responde (${code} para una cuenta que no existe)`
      : `Firebase respondió ${code}`,
  );
}

async function google(page: Page): Promise<void> {
  // Every address the sign-in passes through, from the start.
  const visited: string[] = [];
  page.context().on('request', (r) => {
    if (r.isNavigationRequest()) visited.push(r.url());
  });
  let popup: Page;
  try {
    [popup] = await Promise.all([
      page.context().waitForEvent('page', { timeout: WAIT_MS }),
      page.getByRole('button', { name: /Continuar con Google/ }).click(),
    ]);
  } catch {
    const alert = await page
      .getByRole('alert')
      .first()
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    record('Google', false, `no se abrió la ventana de Google (aviso: ${alert ?? 'ninguno'})`);
    return;
  }
  // Google's page, or an error page, within the wait.
  const deadline = Date.now() + WAIT_MS;
  let url = popup.url();
  while (Date.now() < deadline) {
    url = popup.url();
    if (url.startsWith('https://accounts.google.com/')) break;
    await popup.waitForTimeout(500);
  }
  await popup.waitForLoadState('load', { timeout: 10_000 }).catch(() => undefined);
  const text = (
    (await popup
      .locator('body')
      .textContent({ timeout: 5_000 })
      .catch(() => '')) ?? ''
  )
    .replace(/\s+/g, ' ')
    .slice(0, 600);
  const urls = visited.map((u) => new URL(u));
  const helper = urls.find((u) => u.pathname === '/__/auth/handler');
  const redirect =
    urls.map((u) => u.searchParams.get('redirect_uri')).find(Boolean) ??
    new URL(url).searchParams.get('redirect_uri');
  const via = helper ? `asistente en ${helper.host}` : 'sin pasar por el asistente';
  const refused = /redirect_uri_mismatch|requested action is invalid|Error 400|Error 403/i.exec(
    text,
  );
  if (url.startsWith('https://accounts.google.com/') && !refused) {
    record('Google', true, `abre la página de Google (${via}; regresa a ${redirect ?? '¿?'})`);
  } else {
    record(
      'Google',
      false,
      `${refused ? `Google dice «${refused[0]}»` : 'no llegó a la página de Google'} (${via}; URL ${url.slice(0, 160)}; texto: ${text.slice(0, 300)})`,
    );
  }
  await popup.close().catch(() => undefined);
}

async function helperPages(page: Page): Promise<void> {
  for (const path of ['__/auth/handler', '__/auth/iframe']) {
    const res = await page.request.get(new URL(path, SITE).href).catch(() => null);
    const type = res?.headers()['content-type'] ?? '';
    const ok = res?.status() === 200 && type.includes('text/html');
    record(
      `Asistente /${path}`,
      ok,
      res ? `HTTP ${String(res.status())} ${type}` : 'sin respuesta',
    );
  }
}

async function server(page: Page): Promise<void> {
  if (!DEPLOYMENT_ID) {
    record('Servidor', false, 'falta la variable APPS_SCRIPT_DEPLOYMENT_ID');
    return;
  }
  const url = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;
  const res = await page.request.get(url, { timeout: WAIT_MS }).catch((e: unknown) => String(e));
  if (typeof res === 'string') {
    record('Servidor', false, res.slice(0, 200));
    return;
  }
  const body = await res.text();
  const ok = res.status() === 200 && body.includes('"ok":true');
  record('Servidor', ok, ok ? 'responde' : `HTTP ${String(res.status())}: ${body.slice(0, 200)}`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const context = await browser.newContext({ locale: 'es-MX', timezoneId: 'America/Cancun' });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`error de la página: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`consola: ${m.text()}`);
  });
  page.on('requestfailed', (r) => {
    problems.push(`no cargó ${r.url().slice(0, 120)} (${r.failure()?.errorText ?? '¿?'})`);
  });

  if (await signInPage(page)) {
    await emailAndPassword(page);
    await page.goto(SITE, { waitUntil: 'load' });
    await page.getByRole('heading', { level: 1, name: 'Inicia sesión' }).waitFor();
    await google(page);
  }
  await helperPages(page);
  await server(page);
  await browser.close();

  if (problems.length > 0) {
    console.log('\nLo que el navegador reportó:');
    for (const p of [...new Set(problems)].slice(0, 30)) console.log(`  ${p.slice(0, 300)}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(
      `::error::El portal publicado falla en: ${failed.map((r) => `${r.check} (${r.detail})`).join('; ')}`,
    );
    process.exitCode = 1;
  } else {
    console.log('\nTodo responde: la página, Firebase (correo y Google) y el servidor.');
  }
}

await main();
