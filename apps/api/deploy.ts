#!/usr/bin/env node
/**
 * Publishes the backend once `clasp push` has uploaded it (CI, job "Desplegar
 * el backend"):
 *
 * - Always on the same deployment, so the Web App address never changes.
 * - A new version only when the bundle changed: a project keeps at most 200
 *   versions and only the editor can delete them (docs/LIMITES.md). The
 *   deployment's description carries the bundle's fingerprint, so the check
 *   keeps no state of its own.
 * - Then the Web App must answer its health check (doGet). If the new
 *   version does not, the deployment goes back to the one it served, so the
 *   portal keeps working: a version that asks for new permissions (F5:
 *   Calendar and email) waits until the owner account authorizes them.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Apps Script keeps at most 200 versions per project (docs/LIMITES.md). */
export const MAX_VERSIONS = 200;
/** From this many versions on, every publication warns. */
export const WARN_VERSIONS = 180;
/** What doGet (src/main.ts) names itself. */
export const SERVICE = 'Empírica Portal API';

const HOW_TO_FREE =
  'Borra versiones viejas en el editor de Apps Script, en "Historial del proyecto" (docs/LIMITES.md).';

export interface Deployment {
  deploymentId?: string;
  versionNumber?: number;
  description?: string;
}

/** Short fingerprint of what clasp uploads, as it goes in the description. */
export function fingerprint(contents: readonly string[]): string {
  const hash = createHash('sha256');
  for (const c of contents) hash.update(c).update('\0');
  return `api:${hash.digest('hex').slice(0, 12)}`;
}

export type Decision =
  | { kind: 'missing' }
  | { kind: 'unchanged'; versionNumber: number | undefined }
  | { kind: 'changed' };

/** Whether the deployment already serves this bundle. */
export function decide(
  deployments: readonly Deployment[],
  deploymentId: string,
  print: string,
): Decision {
  const current = deployments.find((d) => d.deploymentId === deploymentId);
  if (!current) return { kind: 'missing' };
  return (current.description ?? '').split(/\s+/).includes(print)
    ? { kind: 'unchanged', versionNumber: current.versionNumber }
    : { kind: 'changed' };
}

/** Whether one more version fits, with a warning when few are left. */
export function versionRoom(count: number): { ok: boolean; message?: string } {
  if (count >= MAX_VERSIONS) {
    return {
      ok: false,
      message: `El proyecto ya tiene ${count} versiones, el máximo de Apps Script. ${HOW_TO_FREE}`,
    };
  }
  if (count + 1 >= WARN_VERSIONS) {
    return {
      ok: true,
      message: `El proyecto tendrá ${count + 1} de ${MAX_VERSIONS} versiones posibles. ${HOW_TO_FREE}`,
    };
  }
  return { ok: true };
}

export const webAppUrl = (deploymentId: string): string =>
  `https://script.google.com/macros/s/${deploymentId}/exec`;

/** The version to go back to when the new one does not answer, if there is one. */
export function rollbackTarget(
  previous: Deployment | undefined,
): { versionNumber: number; description: string } | null {
  if (!previous || typeof previous.versionNumber !== 'number') return null;
  return { versionNumber: previous.versionNumber, description: previous.description ?? '' };
}

/** What to do when the new version did not answer and the old one is back. */
export function rolledBackMessage(versionNumber: number, url: string, last: string): string {
  return (
    `La versión nueva no respondió y el Web App volvió a la versión ${String(versionNumber)}: el portal sigue funcionando. ` +
    'Si la respuesta habla de autorización, la cuenta propietaria debe aceptar los permisos nuevos: ' +
    'abre el editor de Apps Script con esa cuenta (en incógnito), ejecuta la función setup y acepta los permisos marcando «Seleccionar todo»; ' +
    'luego vuelve a ejecutar este job ("Re-run jobs"). ' +
    `(${url}; respuesta: ${last.slice(0, 200)})`
  );
}

/** The variable may hold the ID or, pasted by mistake, the whole address. */
export function deploymentIdFrom(value: string): string {
  const trimmed = value.trim();
  return /\/macros\/s\/([\w-]+)\/(?:exec|dev)\b/.exec(trimmed)?.[1] ?? trimmed;
}

/** What a healthy Web App answers to a GET. */
export function isHealthy(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { ok?: unknown; data?: { service?: unknown } } | null;
    return parsed?.ok === true && parsed.data?.service === SERVICE;
  } catch {
    return false;
  }
}

/** Asks a few times: a version just published can take a moment to answer. */
export async function checkHealth(
  url: string,
  get: (url: string) => Promise<string>,
  wait: (ms: number) => Promise<void>,
  attempts = 4,
): Promise<{ ok: boolean; last: string }> {
  let last = '';
  for (let i = 1; i <= attempts; i++) {
    try {
      last = await get(url);
      if (isHealthy(last)) return { ok: true, last };
    } catch (error) {
      last = String(error);
    }
    if (i < attempts) await wait(i * 5_000);
  }
  return { ok: false, last };
}

function clasp(...args: string[]): string {
  return execFileSync('npx', ['clasp', '--json', ...args], {
    cwd: HERE,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

async function main(): Promise<void> {
  const deploymentId = deploymentIdFrom(process.env.DEPLOYMENT_ID ?? '');
  if (!deploymentId) {
    console.log(
      '::notice::Código subido. Falta la variable APPS_SCRIPT_DEPLOYMENT_ID para publicarlo (docs/SETUP.md, paso 9).',
    );
    return;
  }

  const print = fingerprint(
    ['Code.js', 'appsscript.json'].map((f) => readFileSync(join(HERE, 'build', f), 'utf8')),
  );
  const deployments = JSON.parse(clasp('list-deployments')) as Deployment[];
  const previous = deployments.find((d) => d.deploymentId === deploymentId);
  const decision = decide(deployments, deploymentId, print);
  if (decision.kind === 'missing') {
    throw new Error(
      'La implementación de APPS_SCRIPT_DEPLOYMENT_ID no existe en el proyecto: revisa la variable (docs/SETUP.md, paso 9).',
    );
  }
  if (decision.kind === 'unchanged') {
    console.log(
      `El backend no cambió (${print}): sigue publicada la versión ${decision.versionNumber ?? '(sin número)'}.`,
    );
  } else {
    const room = versionRoom((JSON.parse(clasp('list-versions')) as unknown[]).length);
    if (!room.ok) throw new Error(room.message);
    if (room.message) console.log(`::warning::${room.message}`);
    const sha = (process.env.GITHUB_SHA ?? 'local').slice(0, 7);
    const updated = JSON.parse(
      clasp('update-deployment', deploymentId, '--description', `${sha} ${print}`),
    ) as Deployment;
    console.log(
      `Publicada la versión ${updated.versionNumber ?? '(sin número)'} (${sha} ${print}).`,
    );
  }

  const url = webAppUrl(deploymentId);
  const get = async (u: string): Promise<string> =>
    (await fetch(u, { signal: AbortSignal.timeout(30_000) })).text();
  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  const health = await checkHealth(url, get, wait);
  const back = decision.kind === 'changed' && !health.ok ? rollbackTarget(previous) : null;
  if (back) {
    clasp(
      'update-deployment',
      deploymentId,
      '--versionNumber',
      String(back.versionNumber),
      '--description',
      back.description,
    );
    await checkHealth(url, get, wait);
    throw new Error(rolledBackMessage(back.versionNumber, url, health.last));
  }
  if (!health.ok) {
    throw new Error(
      `El Web App no respondió como se esperaba (${url}). Al abrirla en el navegador debe mostrar {"ok":true,…}; si pide iniciar sesión, en Implementar → Gestionar implementaciones "Quién tiene acceso" debe ser "Cualquier usuario". Respuesta: ${health.last.slice(0, 200)}`,
    );
  }
  console.log(`El Web App responde: ${url}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await main();
  } catch (error) {
    console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
