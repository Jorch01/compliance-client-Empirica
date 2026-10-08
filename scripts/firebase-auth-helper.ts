#!/usr/bin/env node
/**
 * Firebase's sign-in helper, served by the portal itself (D78).
 *
 * Google's sign-in finishes on a page of Firebase's, /__/auth/handler, which
 * hands the account to the portal through another, /__/auth/iframe. On
 * Firebase's domain that handover needs third-party storage, which Safari
 * blocks, and the app installed on an iPhone cannot use the popup either.
 * So the publication (CI, job "Publicar en GitHub Pages") copies those pages
 * from the project's Firebase domain into the site, as Firebase documents
 * for apps hosted elsewhere, and once the GitHub variable
 * FIREBASE_AUTH_DOMAIN names the portal, the sign-in finishes at home
 * (docs/SETUP.md, step 13).
 *
 *   node scripts/firebase-auth-helper.ts apps/web/dist       copy into the build
 *   node scripts/firebase-auth-helper.ts --check <page_url>  after publishing
 *
 * While the variable is unset the portal still uses Firebase's own helper,
 * so a failure only warns. Once it is set, a failed copy stops the
 * publication before anything changes, and a failed check turns the job red.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIREBASE_DOMAIN,
  FIREBASE_PROJECT,
  authDomainFrom,
} from '../apps/web/src/config/firebase-project.ts';

export interface HelperFile {
  /** Where Firebase serves it, and where the portal must answer it. */
  path: string;
  /** Where it goes in the build: GitHub Pages answers /x with x.html. */
  saveAs: string;
  kind: 'html' | 'js' | 'json';
  /** Fewer bytes than this is not the file (an empty answer, an error). */
  minBytes: number;
  /** Not used to sign in with Google (email links): without it the copy goes on. */
  optional?: boolean;
}

/** The files Firebase lists for hosting its helper elsewhere ("Self-host helper code"). */
export const HELPER_FILES: readonly HelperFile[] = [
  { path: '__/auth/handler', saveAs: '__/auth/handler.html', kind: 'html', minBytes: 50 },
  { path: '__/auth/handler.js', saveAs: '__/auth/handler.js', kind: 'js', minBytes: 1_000 },
  { path: '__/auth/experiments.js', saveAs: '__/auth/experiments.js', kind: 'js', minBytes: 0 },
  { path: '__/auth/iframe', saveAs: '__/auth/iframe.html', kind: 'html', minBytes: 50 },
  { path: '__/auth/iframe.js', saveAs: '__/auth/iframe.js', kind: 'js', minBytes: 1_000 },
  {
    path: '__/auth/links',
    saveAs: '__/auth/links.html',
    kind: 'html',
    minBytes: 50,
    optional: true,
  },
  { path: '__/auth/links.js', saveAs: '__/auth/links.js', kind: 'js', minBytes: 0, optional: true },
  { path: '__/firebase/init.json', saveAs: '__/firebase/init.json', kind: 'json', minBytes: 2 },
];

export interface Fetched {
  status: number;
  /** The Content-Type header, or ''. */
  type: string;
  bytes: Uint8Array;
}

export type Get = (url: string) => Promise<Fetched>;
export type Wait = (ms: number) => Promise<void>;

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** What is wrong with an answer for this file, or null if it is the file. */
export function problemWith(file: HelperFile, got: Fetched): string | null {
  if (got.status !== 200) return `respondió ${String(got.status)}`;
  if (got.bytes.length < file.minBytes) return `trae ${String(got.bytes.length)} bytes`;
  const body = text(got.bytes);
  switch (file.kind) {
    case 'html':
      if (!/text\/html/i.test(got.type)) return `no es una página (${got.type || 'sin tipo'})`;
      return /<script\b/i.test(body) ? null : 'la página no carga ningún código';
    case 'js':
      return /^\s*</.test(body) ? 'trae una página en lugar de código' : null;
    case 'json':
      try {
        const config = JSON.parse(body) as { projectId?: unknown } | null;
        return config?.projectId === FIREBASE_PROJECT.projectId
          ? null
          : 'no es la configuración de este proyecto';
      } catch {
        return 'no es JSON';
      }
  }
}

/** The scripts a page loads, as written in it. */
export function scriptsOf(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1] ?? '');
}

/** What a helper page loads from its own domain that the copy does not bring. */
export function missingScripts(page: HelperFile, html: string): string[] {
  const base = `https://${FIREBASE_DOMAIN}/${page.path}`;
  const copied = new Set(HELPER_FILES.map((f) => f.path));
  return scriptsOf(html)
    .map((src) => new URL(src, base))
    .filter((url) => url.host === FIREBASE_DOMAIN)
    .map((url) => url.pathname.replace(/^\//, ''))
    .filter((path) => !copied.has(path));
}

/** Asks again a few times: one bad answer from the network is not the file. */
export async function fetchChecked(
  file: HelperFile,
  url: string,
  get: Get,
  wait: Wait,
  attempts = 3,
  pauseMs = 3_000,
): Promise<{ ok: true; got: Fetched } | { ok: false; problem: string }> {
  let problem = '';
  for (let i = 1; i <= attempts; i++) {
    try {
      const got = await get(url);
      const wrong = problemWith(file, got);
      if (!wrong) return { ok: true, got };
      problem = wrong;
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    if (i < attempts) await wait(i * pauseMs);
  }
  return { ok: false, problem };
}

/**
 * The project's configuration as Firebase serves it at /__/firebase/init.json,
 * for when its domain does not (a project without a Hosting site).
 */
export function initJson(apiKey: string): string {
  return JSON.stringify({ apiKey, authDomain: FIREBASE_DOMAIN, ...FIREBASE_PROJECT });
}

export interface Copy {
  files: { saveAs: string; bytes: Uint8Array }[];
  /** What the log shows: size, fingerprint and what each page loads. */
  lines: string[];
  problems: string[];
}

/** Every helper file from Firebase's domain, checked, without writing anything yet. */
export async function collect(get: Get, wait: Wait, apiKey: string): Promise<Copy> {
  const copy: Copy = { files: [], lines: [], problems: [] };
  for (const file of HELPER_FILES) {
    const url = `https://${FIREBASE_DOMAIN}/${file.path}`;
    const result = await fetchChecked(file, url, get, wait);
    let bytes: Uint8Array;
    if (result.ok) {
      bytes = result.got.bytes;
    } else if (file.kind === 'json' && apiKey) {
      bytes = new TextEncoder().encode(initJson(apiKey));
      copy.lines.push(
        `${file.path}: ${result.problem}; se escribe con la configuración del portal`,
      );
    } else if (file.optional) {
      copy.lines.push(`${file.path}: ${result.problem}; no hace falta para entrar con Google`);
      continue;
    } else {
      copy.problems.push(`${url} ${result.problem}`);
      continue;
    }
    if (file.kind === 'html') {
      const html = text(bytes);
      for (const path of missingScripts(file, html)) {
        copy.problems.push(
          `${file.path} carga ${path}, que no está en la copia (agrégalo a HELPER_FILES)`,
        );
      }
      copy.lines.push(`${file.path} carga: ${scriptsOf(html).join(', ')}`);
    }
    const print = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    copy.lines.push(`${(bytes.length / 1024).toFixed(1).padStart(7)} KB  ${print}  ${file.saveAs}`);
    copy.files.push({ saveAs: file.saveAs, bytes });
  }
  return copy;
}

/**
 * Whether the portal finishes Google's sign-in itself, and what is wrong
 * with the variable: it must be the domain the site is published on.
 */
export function copyPlan(
  variable: string | undefined,
  pagesHost: string | undefined,
): { authDomain: string; inUse: boolean; mismatch: string | null } {
  const authDomain = authDomainFrom(variable);
  const inUse = authDomain !== FIREBASE_DOMAIN;
  const host = (pagesHost ?? '').trim().toLowerCase();
  const mismatch =
    inUse && host && authDomain !== host
      ? `La variable FIREBASE_AUTH_DOMAIN dice ${authDomain}, pero el portal se publica en ${host}: ` +
        'debe ser ese dominio, sin https:// (docs/SETUP.md, paso 13). El sitio no se publicó y sigue el anterior.'
      : null;
  return { authDomain, inUse, mismatch };
}

const root = fileURLToPath(new URL('../', import.meta.url));

const get: Get = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  return {
    status: response.status,
    type: response.headers.get('content-type') ?? '',
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
};
const wait: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** What to do when the portal relies on its copy and a step fails. */
const ADVICE = {
  copy: 'El sitio no se publicó y sigue el anterior: vuelve a ejecutar el job (docs/OPERACION.md).',
  check:
    'Google no deja entrar mientras falte: vuelve a ejecutar el job y, si sigue igual, vacía la variable FIREBASE_AUTH_DOMAIN y vuelve a publicar (docs/OPERACION.md).',
} as const;

async function copyInto(dist: string, plan: ReturnType<typeof copyPlan>): Promise<void> {
  if (!existsSync(join(dist, 'index.html'))) {
    throw new Error(`No está ${join(dist, 'index.html')}: corre antes npm run build.`);
  }
  const copy = await collect(get, wait, (process.env.FIREBASE_WEB_API_KEY ?? '').trim());
  for (const line of copy.lines) console.log(line);
  if (copy.problems.length > 0) {
    throw new Error(
      `No se pudo copiar el asistente de inicio de sesión de Firebase: ${copy.problems.join('; ')}.`,
    );
  }
  for (const file of copy.files) {
    const target = join(dist, file.saveAs);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.bytes);
  }
  console.log(
    plan.inUse
      ? `Asistente copiado: el inicio de sesión con Google termina en ${plan.authDomain}.`
      : `Asistente copiado. El portal sigue con el de Firebase (${FIREBASE_DOMAIN}) mientras la variable FIREBASE_AUTH_DOMAIN esté vacía (docs/SETUP.md, paso 13).`,
  );
}

async function checkPublished(pageUrl: string): Promise<void> {
  if (!pageUrl) throw new Error('Falta la dirección del sitio publicado.');
  const problems: string[] = [];
  for (const file of HELPER_FILES) {
    const url = new URL(file.path, pageUrl).href;
    // The site can take a moment to answer at its address once published.
    const result = await fetchChecked(file, url, get, wait, 4, 5_000);
    if (result.ok) continue;
    if (file.optional)
      console.log(`${url} ${result.problem}; no hace falta para entrar con Google.`);
    else problems.push(`${url} ${result.problem}`);
  }
  if (problems.length > 0) {
    throw new Error(
      `El sitio publicado no responde con el asistente de inicio de sesión: ${problems.join('; ')}.`,
    );
  }
  console.log(`El sitio publicado responde con el asistente de inicio de sesión (${pageUrl}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [first, second] = process.argv.slice(2);
  const mode = first === '--check' ? 'check' : 'copy';
  const plan = copyPlan(process.env.FIREBASE_AUTH_DOMAIN, process.env.PAGES_HOST);
  if (plan.mismatch) {
    console.log(`::error::${plan.mismatch}`);
    process.exitCode = 1;
  } else {
    try {
      if (mode === 'check') await checkPublished(second ?? '');
      else await copyInto(resolve(root, first ?? 'apps/web/dist'), plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (plan.inUse) {
        console.log(`::error::${message} ${ADVICE[mode]}`);
        process.exitCode = 1;
      } else {
        // Firebase's own helper still serves the portal: nothing stops.
        console.log(`::warning::${message} Por ahora no afecta: el portal usa el de Firebase.`);
      }
    }
  }
}
