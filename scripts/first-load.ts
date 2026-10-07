#!/usr/bin/env node
/**
 * What a first visit downloads before the sign-in screen, compressed, and
 * the ceiling it must stay under (PLAN.md § 21): the page's script and
 * styles, every module they import, and the sign-in provider (Firebase),
 * which loads at once. Each screen is downloaded when it opens, so it does
 * not count here.
 *
 *   npm run size            (after npm run build)
 *
 * Fails, and says by how much, if the first load grows past the ceiling.
 * Raise FIRST_LOAD_KB only on purpose, with the reason in PLAN.md.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * Ceiling of the first load, in KB of 1,024 bytes, gzip. On 2026-10-07 it
 * was 312 KB with every screen in it, and 240 KB once each screen loads when
 * it opens.
 */
const FIRST_LOAD_KB = 260;
/** The sign-in provider, loaded right after the page (src/auth/firebase.ts). */
const AUTH_CHUNK = /^firebase-[\w-]+\.js$/;

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, process.argv[2] ?? 'apps/web/dist');
const assets = join(dist, 'assets');

/** The files of assets/ the page names: its script, its preloads, its styles. */
function pageAssets(html: string): string[] {
  const names = [...html.matchAll(/(?:src|href)="[^"]*\/assets\/([^"/]+\.(?:js|css))"/g)].map(
    (m) => m[1] ?? '',
  );
  return [...new Set(names)].filter(Boolean);
}

/** A module's static imports among its sibling chunks (not `import("…")`, which waits). */
function staticImports(code: string): string[] {
  return [...code.matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([\w.-]+\.js)["']/g)].map(
    (m) => m[1] ?? '',
  );
}

function check(): void {
  const index = join(dist, 'index.html');
  if (!existsSync(index)) {
    console.error(`No está ${index}: corre antes npm run build.`);
    process.exit(1);
  }
  const auth = readdirSync(assets).filter((f) => AUTH_CHUNK.test(f));
  if (auth.length !== 1) {
    console.error(
      `Se esperaba un archivo de inicio de sesión (${String(AUTH_CHUNK)}) y hay ${String(auth.length)}: actualiza este script.`,
    );
    process.exit(1);
  }
  const pending = [...pageAssets(readFileSync(index, 'utf8')), ...auth];
  const seen = new Set<string>();
  while (pending.length) {
    const file = pending.pop() ?? '';
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith('.js'))
      pending.push(...staticImports(readFileSync(join(assets, file), 'utf8')));
  }

  const rows = [...seen]
    .map((file) => ({ file, kb: gzipSync(readFileSync(join(assets, file))).length / 1024 }))
    .sort((a, b) => b.kb - a.kb);
  const total = rows.reduce((sum, r) => sum + r.kb, 0);
  for (const r of rows) console.log(`${r.kb.toFixed(1).padStart(7)} KB  ${r.file}`);
  console.log(
    `Primera carga: ${total.toFixed(1)} KB comprimidos (${String(rows.length)} archivos); tope ${String(FIRST_LOAD_KB)} KB.`,
  );
  if (total > FIRST_LOAD_KB) {
    console.error(
      `La primera carga pasó el tope por ${(total - FIRST_LOAD_KB).toFixed(1)} KB. ` +
        'Carga lo nuevo al abrir su pantalla (lazyPage) o, si de verdad hace falta, sube el tope y anota por qué.',
    );
    process.exit(1);
  }
}

check();
