#!/usr/bin/env node
/**
 * Extracts the official brand colors and logos from the vector master: the
 * agency's Illustrator file of the firm's email signatures.
 *
 *   npm run brand:vector                 # reads brand/private/EMPIRICA_FIRMAS.ai
 *   npm run brand:vector -- other.ai     # or any other copy of the master
 *
 * Requires `pdftocairo` (poppler-utils). The .ai is PDF-compatible.
 *
 * The master lives in brand/private/, which git ignores: the signatures carry a
 * person's name, phone and e-mail, and this repository is public. Only what is
 * safe to publish leaves this script:
 *
 *   brand/spot-colors.json                 the spot colors (Pantone) with their Lab values
 *   brand/logo/<name>-<color>.svg          logos as outlines, in the two brand colors
 *   packages/shared/src/brand/logos.json   the same outlines for the app (currentColor)
 *
 * Why the master and not the letterhead: Illustrator defines the brand as two
 * Pantone spot colors with exact Lab values. The letterhead is a raster that
 * went through a color conversion on export and drifted slightly.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  D50_WHITE,
  formatOklch,
  hexToOklch,
  labD50ToSrgb,
  toHex,
} from '../../packages/shared/src/brand/color.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MASTER = join(ROOT, 'brand', 'private', 'EMPIRICA_FIRMAS.ai');

// ---------------------------------------------------------------------------
// Spot colors
// ---------------------------------------------------------------------------

export interface SpotColor {
  name: string;
  /** Full-strength color, CIE Lab relative to D50. */
  lab: [number, number, number];
  /** Zero-tint color (paper), CIE Lab relative to D50. */
  paperLab: [number, number, number];
  hex: string;
  oklch: string;
  clipped: boolean;
}

const decodePdfName = (name: string): string =>
  name.replace(/#([0-9a-f]{2})/gi, (_m: string, h: string) => String.fromCharCode(parseInt(h, 16)));

const numbers = (s: string): number[] => (s.match(/-?\d*\.?\d+/g) ?? []).map(Number);

/**
 * Reads every `[/Separation /Name <Lab ref> <<tint transform>>]` color space.
 * Illustrator writes Pantone swatches this way: the alternate space is Lab and
 * the tint transform interpolates from paper (C0) to full ink (C1).
 */
function readSpotColors(pdf: string): SpotColor[] {
  const labWhite = new Map<string, number[]>();
  for (const m of pdf.matchAll(/(\d+)\s+0\s+obj\s*\[\s*\/Lab\s*<<([^]*?)>>\s*\]/g)) {
    const white = /\/WhitePoint\s*\[([^\]]*)\]/.exec(m[2] ?? '');
    if (m[1] && white?.[1]) labWhite.set(m[1], numbers(white[1]));
  }

  const spots: SpotColor[] = [];
  const re = /\[\s*\/Separation\s*\/([^\s/[\]<>]+)\s*(\d+)\s+0\s+R\s*<<([^]*?)>>\s*\]/g;
  for (const m of pdf.matchAll(re)) {
    const [, rawName = '', labRef = '', dict = ''] = m;
    const white = labWhite.get(labRef);
    if (!white) throw new Error(`Spot color ${rawName}: its alternate space is not Lab.`);
    if (white.some((v, i) => Math.abs(v - (D50_WHITE[i] ?? 0)) > 1e-3)) {
      throw new Error(`Spot color ${rawName}: Lab white point is not D50 (${white.join(', ')}).`);
    }
    const c0 = numbers(/\/C0\s*\[([^\]]*)\]/.exec(dict)?.[1] ?? '');
    const c1 = numbers(/\/C1\s*\[([^\]]*)\]/.exec(dict)?.[1] ?? '');
    const n = Number(/\/N\s+(-?\d*\.?\d+)/.exec(dict)?.[1] ?? NaN);
    if (c0.length !== 3 || c1.length !== 3 || n !== 1) {
      throw new Error(`Spot color ${rawName}: unexpected tint transform.`);
    }
    const lab = c1 as [number, number, number];
    const { rgb, clipped } = labD50ToSrgb(lab);
    const hex = toHex(rgb);
    spots.push({
      name: decodePdfName(rawName),
      lab,
      paperLab: c0 as [number, number, number],
      hex,
      oklch: formatOklch(hexToOklch(hex)),
      clipped,
    });
  }
  return spots;
}

// ---------------------------------------------------------------------------
// Logos
// ---------------------------------------------------------------------------

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface VectorPath {
  d: string;
  fill: string;
  box: Box;
}

/** pdftocairo writes absolute M/L/C/Z commands, so every pair is a point. */
function boxOf(d: string): Box {
  const n = numbers(d);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function union(boxes: Box[]): Box {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

/**
 * The filled paths of one page, as SVG. Text never comes through: pdftocairo
 * writes text as <use> references to glyphs, and only <path> elements with
 * their own fill are read here. The full-page background is dropped.
 */
function pagePaths(master: string, page: number): VectorPath[] {
  const dir = mkdtempSync(join(tmpdir(), 'empirica-vector-'));
  try {
    const out = join(dir, 'page.svg');
    execFileSync('pdftocairo', ['-svg', '-f', String(page), '-l', String(page), master, out]);
    const svg = readFileSync(out, 'utf8');
    const viewBox = numbers(/viewBox="([^"]+)"/.exec(svg)?.[1] ?? '');
    const pageArea = (viewBox[2] ?? 0) * (viewBox[3] ?? 0);
    const paths: VectorPath[] = [];
    for (const m of svg.matchAll(/<path\b([^>]*?)\bd="([^"]+)"[^>]*\/>/g)) {
      const fill = /\bfill="([^"]+)"/.exec(m[1] ?? '')?.[1];
      if (!fill || !m[2]) continue; // glyph outlines and clip paths carry no fill
      const box = boxOf(m[2]);
      if ((box.x1 - box.x0) * (box.y1 - box.y0) > pageArea * 0.9) continue; // background
      paths.push({ d: m[2], fill, box });
    }
    return paths;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Groups paths into horizontal bands separated by vertical gaps. */
function bands(paths: VectorPath[], gap: number): VectorPath[][] {
  const sorted = [...paths].sort((a, b) => a.box.y0 - b.box.y0);
  const out: VectorPath[][] = [];
  let bottom = Number.NEGATIVE_INFINITY;
  for (const p of sorted) {
    const current = out[out.length - 1];
    if (current && p.box.y0 <= bottom + gap) {
      current.push(p);
      bottom = Math.max(bottom, p.box.y1);
    } else {
      out.push([p]);
      bottom = p.box.y1;
    }
  }
  return out;
}

const round = (d: string): string =>
  d.replace(/-?\d*\.\d+/g, (n) => String(Math.round(Number(n) * 1000) / 1000)).replace(/\s+/g, ' ');

interface Logo {
  name: string;
  title: string;
  paths: VectorPath[];
}

function logoGeometry(logo: Logo): { viewBox: string; paths: string[] } {
  const box = union(logo.paths.map((p) => p.box));
  const pad = Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.02;
  const r = (v: number): number => Math.round(v * 100) / 100;
  return {
    viewBox: [box.x0 - pad, box.y0 - pad, box.x1 - box.x0 + 2 * pad, box.y1 - box.y0 + 2 * pad]
      .map(r)
      .join(' '),
    paths: logo.paths.map((p) => round(p.d).trim()),
  };
}

function logoSvg(logo: Logo, fill: string): string {
  const { viewBox, paths } = logoGeometry(logo);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title">`,
    `<title id="title">${logo.title}</title>`,
    `<g fill="${fill}">`,
    ...paths.map((d) => `<path d="${d}"/>`),
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const master = process.argv[2] ?? DEFAULT_MASTER;
  let bytes: Buffer;
  try {
    bytes = readFileSync(master);
  } catch {
    throw new Error(
      `No encuentro el archivo maestro en ${master}. Cópialo a brand/private/ (no se sube al repositorio).`,
    );
  }

  const spots = readSpotColors(bytes.toString('latin1'));
  if (spots.length < 2) throw new Error('The master should define at least two spot colors.');
  const [dark, light] = [...spots].sort((a, b) => a.lab[0] - b.lab[0]);
  if (!dark || !light) throw new Error('Missing spot colors.');

  // Page 1: main logo in three bands (symbol, wordmark, "LEGAL LAB").
  // Page 2: the circular seal. Anything else means the master changed: stop.
  const main = pagePaths(master, 1);
  const rows = bands(main, 3);
  if (rows.length !== 3) {
    throw new Error(`Expected symbol, wordmark and tagline on page 1; found ${rows.length} bands.`);
  }
  const [symbol = [], wordmark = [], tagline = []] = rows;
  const seal = pagePaths(master, 2);
  if (!seal.length) throw new Error('Expected the circular seal on page 2.');

  const logos: Logo[] = [
    { name: 'logo', title: 'Empírica Legal Lab', paths: main },
    { name: 'logotipo', title: 'Empírica Legal Lab', paths: [...wordmark, ...tagline] },
    { name: 'simbolo', title: 'Empírica', paths: symbol },
    { name: 'sello', title: 'Empírica Legal Lab', paths: seal },
  ];

  const written: string[] = [];
  const write = (file: string, content: string): void => {
    if (/<use\b|<text\b|glyph/i.test(content)) throw new Error(`${file} would carry text.`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    written.push(relative(ROOT, file));
  };

  for (const logo of logos) {
    write(join(ROOT, 'brand', 'logo', `${logo.name}-verde.svg`), logoSvg(logo, dark.hex));
    write(join(ROOT, 'brand', 'logo', `${logo.name}-durazno.svg`), logoSvg(logo, light.hex));
  }

  write(
    join(ROOT, 'packages', 'shared', 'src', 'brand', 'logos.json'),
    `${JSON.stringify(Object.fromEntries(logos.map((l) => [l.name, logoGeometry(l)])), null, 2)}\n`,
  );

  write(
    join(ROOT, 'brand', 'spot-colors.json'),
    `${JSON.stringify(
      {
        $comment:
          'Generated by scripts/brand/extract-vector.ts from the vector master (kept out of the repo). Do not edit by hand.',
        source: {
          file: 'brand/private/EMPIRICA_FIRMAS.ai',
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
        conversion: 'CIE Lab (D50) -> Bradford D50->D65 -> sRGB',
        dark: dark.name,
        light: light.name,
        spots,
      },
      null,
      2,
    )}\n`,
  );

  console.log('\nSpot colors (vector master)');
  for (const s of spots) {
    console.log(`  ${s.name.padEnd(16)} Lab ${s.lab.join(' / ')}  ->  ${s.hex}  ${s.oklch}`);
  }
  console.log(
    `\nLogo bands on page 1: ${rows.map((r) => r.length).join(' + ')} paths; seal: ${seal.length}`,
  );
  for (const f of written) console.log(`  wrote ${f}`);
}

main();
