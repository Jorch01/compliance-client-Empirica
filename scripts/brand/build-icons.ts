#!/usr/bin/env node
/**
 * The portal's icons, drawn from the brand: the symbol in durazno on the
 * institutional green, like the sidebar.
 *
 *   npm run brand:icons
 *
 * Inputs:  packages/shared/src/brand/tokens.json  (colors)
 *          packages/shared/src/brand/logos.json   (the symbol, as vector paths)
 * Outputs: apps/web/public/favicon.svg
 *          apps/web/public/icons/icon-192.png, icon-512.png       (any)
 *          apps/web/public/icons/icon-maskable-512.png            (Android masks)
 *          apps/web/public/icons/apple-touch-icon.png             (iPhone, 180 px)
 *
 * The PNGs are rendered by Chromium (Playwright). Set CHROMIUM_PATH to use a
 * browser other than Playwright's own. No color is typed here: both come
 * from the tokens.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const tokens = JSON.parse(
  readFileSync(join(root, 'packages/shared/src/brand/tokens.json'), 'utf8'),
) as { brand: { green: string; peach: string } };
const logos = JSON.parse(
  readFileSync(join(root, 'packages/shared/src/brand/logos.json'), 'utf8'),
) as Record<string, { viewBox: string; paths: string[] }>;

const symbol =
  logos.simbolo ??
  ((): never => {
    throw new Error('logos.json has no "simbolo"');
  })();
const [vx = 0, vy = 0, vw = 1, vh = 1] = symbol.viewBox.split(/\s+/).map(Number);

/**
 * A square icon: `width` is the symbol's share of the side. Maskable icons
 * keep it inside the central 80 % circle Android may crop to.
 */
function iconSvg(size: number, width: number, radius = 0): string {
  const w = size * width;
  const h = (w * vh) / vw;
  const scale = w / vw;
  const x = (size - w) / 2 - vx * scale;
  const y = (size - h) / 2 - vy * scale;
  const paths = symbol.paths.map((d) => `<path d="${d}"/>`).join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(size)}" height="${String(size)}" viewBox="0 0 ${String(size)} ${String(size)}">`,
    `<rect width="${String(size)}" height="${String(size)}" rx="${String(radius)}" fill="${tokens.brand.green}"/>`,
    `<g fill="${tokens.brand.peach}" transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(5)})">${paths}</g>`,
    '</svg>',
  ].join('');
}

const out = join(root, 'apps/web/public');
mkdirSync(join(out, 'icons'), { recursive: true });
writeFileSync(join(out, 'favicon.svg'), `${iconSvg(64, 0.78, 14)}\n`);

const PNGS: { file: string; size: number; width: number }[] = [
  { file: 'icon-192.png', size: 192, width: 0.66 },
  { file: 'icon-512.png', size: 512, width: 0.66 },
  { file: 'icon-maskable-512.png', size: 512, width: 0.5 },
  { file: 'apple-touch-icon.png', size: 180, width: 0.62 },
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
try {
  const page = await browser.newPage();
  for (const { file, size, width } of PNGS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0">${iconSvg(size, width)}</body></html>`);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(join(out, 'icons', file), png);
    console.log(`apps/web/public/icons/${file}`);
  }
} finally {
  await browser.close();
}
console.log('apps/web/public/favicon.svg');
