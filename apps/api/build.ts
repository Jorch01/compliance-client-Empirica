#!/usr/bin/env node
/**
 * Bundles the Apps Script backend into build/Code.js with esbuild.
 *
 * clasp only uploads files; it does not transpile TypeScript reliably, so we
 * never ask it to. esbuild produces one plain JavaScript file that Apps
 * Script's V8 runtime understands, and the functions Apps Script must find by
 * name (doGet, doPost, trigger handlers...) are re-declared at top level.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type BuildOptions } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'build');

/** Functions Apps Script calls by name. Add trigger handlers here. */
export const ENTRY_POINTS = ['doGet', 'doPost', 'setup', 'nightly'] as const;

export const BUNDLE_OPTIONS: BuildOptions = {
  entryPoints: [join(HERE, 'src', 'main.ts')],
  bundle: true,
  format: 'iife',
  globalName: '__portal',
  platform: 'neutral',
  // Older syntax than Apps Script's V8 needs, to be safe with optional
  // chaining, class fields and the like.
  target: 'es2019',
  charset: 'utf8',
  legalComments: 'none',
  footer: {
    js: ENTRY_POINTS.map(
      (name) => `function ${name}() { return __portal.${name}.apply(this, arguments); }`,
    ).join('\n'),
  },
};

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  await build({ ...BUNDLE_OPTIONS, outfile: join(OUT_DIR, 'Code.js') });
  copyFileSync(join(HERE, 'appsscript.json'), join(OUT_DIR, 'appsscript.json'));
  console.log('Built apps/api/build/Code.js and appsscript.json');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
