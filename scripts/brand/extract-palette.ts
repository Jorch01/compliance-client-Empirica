#!/usr/bin/env node
/**
 * Extracts the brand palette from the files in /brand and writes
 * brand/palette.json.
 *
 *   npm run brand:palette
 *
 * Requires `pdfimages` (poppler-utils) to read the letterhead.
 *
 * Sources, and why each one is read the way it is:
 *
 * - hoja_membretada.pdf (the official letterhead). It holds a single JPEG
 *   encoded in Adobe RGB (1998) plus a transparency mask. Reading those pixels
 *   as if they were sRGB shifts every color, so each pixel is converted to sRGB
 *   first. JPEG noise means no two ink pixels are identical, so ink colors are
 *   found by clustering in OKLab and reported as the per-channel median of each
 *   cluster. Only interior pixels (fully opaque, with fully opaque neighbors)
 *   are used, so anti-aliased edges do not drag the colors toward white.
 *
 * - EmpiricaLab_C1..C3.png (social posts). They are photographs with flat
 *   digital text on top. Flat text repeats the exact same RGB value in
 *   thousands of pixels, while the photo underneath almost never repeats, so
 *   the most frequent exact value inside each headline region IS the overlay
 *   color. The rest of each image is clustered only as a photographic
 *   reference: those colors are lighting, not brand.
 *
 * The output is deterministic: same inputs, same file.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { PNG } from 'pngjs';
import {
  adobeRgbToLinear,
  deltaEOk,
  labD50ToSrgb,
  formatOklch,
  linearAdobeRgbToLinearSrgb,
  linearSrgbToOklab,
  linearToSrgb,
  oklabToOklch,
  parseHex,
  rgbToOklab,
  toHex,
  type Oklab,
} from '../../packages/shared/src/brand/color.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRAND = join(ROOT, 'brand');
const LETTERHEAD = 'hoja_membretada.pdf';

// Headline regions in the 1080x1350 posts (pixel coordinates).
// Chosen by eye from the images; each box holds the text plus some photo.
const REGIONS: Record<string, { file: string; x: number; y: number; w: number; h: number }> = {
  'C1 · titular "LO TRADICIONAL,"': { file: 'EmpiricaLab_C1.png', x: 320, y: 630, w: 440, h: 100 },
  'C2 · titular "CLARAS Y CERCANAS."': {
    file: 'EmpiricaLab_C2.png',
    x: 280,
    y: 630,
    w: 545,
    h: 110,
  },
  'C3 · titular "UN LABORATORIO JURÍDICO"': {
    file: 'EmpiricaLab_C3.png',
    x: 190,
    y: 620,
    w: 700,
    h: 100,
  },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const round = (v: number, d = 4): number => Number(v.toFixed(d));

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function oklchOf(lab: Oklab): { l: number; c: number; h: number; css: string } {
  const lch = oklabToOklch(lab);
  return { l: round(lch.l), c: round(lch.c), h: round(lch.h, 1), css: formatOklch(lch) };
}

function byteHex(r: number, g: number, b: number): string {
  return toHex({ r: r / 255, g: g / 255, b: b / 255 });
}

// ---------------------------------------------------------------------------
// PDF: ICC profile check and image extraction
// ---------------------------------------------------------------------------

/** Descriptions of the ICC profiles embedded in a PDF (e.g. "Adobe RGB (1998)"). */
function iccDescriptions(pdf: Buffer): string[] {
  const text = pdf.toString('latin1');
  const found = new Set<string>();
  const objRe = /\d+\s+0\s+obj\s*<<([^]*?)>>\s*stream\r?\n/g;
  for (let m = objRe.exec(text); m; m = objRe.exec(text)) {
    const dict = m[1] ?? '';
    if (!/\/N\s+3\b/.test(dict)) continue;
    const length = /\/Length\s+(\d+)/.exec(dict);
    if (!length?.[1]) continue;
    const start = m.index + m[0].length;
    const raw = pdf.subarray(start, start + Number(length[1]));
    let profile: Buffer;
    try {
      profile = dict.includes('FlateDecode') ? inflateSync(raw) : Buffer.from(raw);
    } catch {
      continue;
    }
    if (profile.length < 132 || profile.toString('latin1', 36, 40) !== 'acsp') continue;
    const tagCount = profile.readUInt32BE(128);
    for (let t = 0; t < tagCount; t++) {
      const base = 132 + t * 12;
      if (profile.toString('latin1', base, base + 4) !== 'desc') continue;
      const offset = profile.readUInt32BE(base + 4);
      const type = profile.toString('latin1', offset, offset + 4);
      if (type === 'desc') {
        const count = profile.readUInt32BE(offset + 8);
        found.add(profile.toString('latin1', offset + 12, offset + 12 + count).replace(/\0+$/, ''));
      } else if (type === 'mluc') {
        const recLength = profile.readUInt32BE(offset + 20);
        const recOffset = profile.readUInt32BE(offset + 24);
        const utf16be = profile.subarray(offset + recOffset, offset + recOffset + recLength);
        found.add(Buffer.from(utf16be).swap16().toString('utf16le'));
      }
    }
  }
  return [...found];
}

/** Runs pdfimages and returns the decoded image and its soft mask. */
function letterheadRaster(pdfPath: string): { image: PNG; mask: PNG } {
  const listing = execFileSync('pdfimages', ['-list', pdfPath], { encoding: 'utf8' });
  const rows = listing
    .split('\n')
    .slice(2)
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length > 3);
  const imageRow = rows.find((cols) => cols[2] === 'image');
  const maskRow = rows.find((cols) => cols[2] === 'smask');
  if (!imageRow || !maskRow) throw new Error('The letterhead should hold one image and one smask.');

  const dir = mkdtempSync(join(tmpdir(), 'empirica-brand-'));
  try {
    execFileSync('pdfimages', ['-png', pdfPath, join(dir, 'img')]);
    const name = (num: string | undefined): string =>
      join(dir, `img-${String(num).padStart(3, '0')}.png`);
    return {
      image: PNG.sync.read(readFileSync(name(imageRow[1]))),
      mask: PNG.sync.read(readFileSync(name(maskRow[1]))),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Clustering in OKLab
// ---------------------------------------------------------------------------

interface Cluster {
  hex: string;
  /** Per-channel median of the original encoded values, when they were not sRGB. */
  source?: { space: string; rgb: number[] };
  meanHex: string;
  oklch: { l: number; c: number; h: number; css: string };
  pixels: number;
  share: number;
}

/**
 * Deterministic clustering: a coarse OKLab histogram, then bins merged greedily
 * (largest first) into clusters closer than `mergeDistance`. Each pixel is then
 * assigned to its nearest cluster and the cluster color is the per-channel
 * median of its pixels, which shrugs off JPEG ringing better than the mean.
 */
function cluster(
  labs: Float32Array,
  rgbs: Uint8Array,
  count: number,
  {
    mergeDistance = 0.06,
    minBinShare = 0.001,
    maxAssignDistance = 0.1,
    sources = null as { space: string; bytes: Uint8Array } | null,
  } = {},
): Cluster[] {
  const bins = new Map<string, { n: number; l: number; a: number; b: number }>();
  for (let i = 0; i < count; i++) {
    const l = labs[i * 3] ?? 0;
    const a = labs[i * 3 + 1] ?? 0;
    const b = labs[i * 3 + 2] ?? 0;
    const key = `${Math.round(l / 0.02)}|${Math.round(a / 0.01)}|${Math.round(b / 0.01)}`;
    const bin = bins.get(key) ?? { n: 0, l: 0, a: 0, b: 0 };
    bin.n++;
    bin.l += l;
    bin.a += a;
    bin.b += b;
    bins.set(key, bin);
  }

  const centers: { n: number; lab: Oklab }[] = [];
  const sorted = [...bins.values()].sort((x, y) => y.n - x.n || x.l - y.l || x.a - y.a);
  for (const bin of sorted) {
    if (bin.n < count * minBinShare) break;
    const lab = { l: bin.l / bin.n, a: bin.a / bin.n, b: bin.b / bin.n };
    const near = centers.find((c) => deltaEOk(c.lab, lab) < mergeDistance);
    if (near) {
      const total = near.n + bin.n;
      near.lab = {
        l: (near.lab.l * near.n + lab.l * bin.n) / total,
        a: (near.lab.a * near.n + lab.a * bin.n) / total,
        b: (near.lab.b * near.n + lab.b * bin.n) / total,
      };
      near.n = total;
    } else {
      centers.push({ n: bin.n, lab });
    }
  }

  const histograms = centers.map(() => ({
    n: 0,
    r: new Uint32Array(256),
    g: new Uint32Array(256),
    b: new Uint32Array(256),
    src: [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)],
    sum: [0, 0, 0],
  }));
  for (let i = 0; i < count; i++) {
    const lab = { l: labs[i * 3] ?? 0, a: labs[i * 3 + 1] ?? 0, b: labs[i * 3 + 2] ?? 0 };
    let best = -1;
    let bestDistance = maxAssignDistance;
    centers.forEach((c, k) => {
      const d = deltaEOk(c.lab, lab);
      if (d < bestDistance) {
        bestDistance = d;
        best = k;
      }
    });
    const h = histograms[best];
    if (!h) continue;
    const r = rgbs[i * 3] ?? 0;
    const g = rgbs[i * 3 + 1] ?? 0;
    const b = rgbs[i * 3 + 2] ?? 0;
    h.n++;
    h.r[r] = (h.r[r] ?? 0) + 1;
    h.g[g] = (h.g[g] ?? 0) + 1;
    h.b[b] = (h.b[b] ?? 0) + 1;
    h.sum[0] = (h.sum[0] ?? 0) + r;
    h.sum[1] = (h.sum[1] ?? 0) + g;
    h.sum[2] = (h.sum[2] ?? 0) + b;
    if (sources) {
      for (let c = 0; c < 3; c++) {
        const v = sources.bytes[i * 3 + c] ?? 0;
        const hist = h.src[c];
        if (hist) hist[v] = (hist[v] ?? 0) + 1;
      }
    }
  }

  const median = (hist: Uint32Array, n: number): number => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v] ?? 0;
      if (acc * 2 >= n) return v;
    }
    return 255;
  };

  return histograms
    .filter((h) => h.n > 0)
    .map((h) => {
      const r = median(h.r, h.n);
      const g = median(h.g, h.n);
      const b = median(h.b, h.n);
      const mean = h.sum.map((s) => s / h.n);
      const source = sources
        ? { space: sources.space, rgb: h.src.map((hist) => median(hist, h.n)) }
        : undefined;
      return {
        hex: byteHex(r, g, b),
        ...(source ? { source } : {}),
        meanHex: byteHex(mean[0] ?? 0, mean[1] ?? 0, mean[2] ?? 0),
        oklch: oklchOf(rgbToOklab({ r: r / 255, g: g / 255, b: b / 255 })),
        pixels: h.n,
        share: 0,
      };
    })
    .sort((x, y) => y.pixels - x.pixels)
    .map((c, _i, all) => ({
      ...c,
      share: round(c.pixels / all.reduce((s, x) => s + x.pixels, 0)),
    }));
}

// ---------------------------------------------------------------------------
// Letterhead
// ---------------------------------------------------------------------------

interface TranslucentLayer {
  alpha: number;
  opacity: number;
  /** Soft-mask matte color, if the stored colors are premultiplied. */
  matte: number[] | null;
  /** The ink stored in the image under the layer, before transparency. */
  ink: Cluster[];
  /** What the reader sees: the ink composited over white paper. */
  onWhite: Cluster[];
}

function analyzeLetterhead(): {
  profile: string;
  clippedPixels: number;
  clusters: Cluster[];
  translucentLayer: TranslucentLayer | null;
} {
  const pdfPath = join(BRAND, LETTERHEAD);
  const profiles = iccDescriptions(readFileSync(pdfPath));
  if (!profiles.includes('Adobe RGB (1998)')) {
    throw new Error(
      `Expected the letterhead image in Adobe RGB (1998); found: ${profiles.join(', ') || 'none'}. ` +
        'The conversion below assumes that profile, so stop here instead of guessing.',
    );
  }

  const { image, mask } = letterheadRaster(pdfPath);
  const { width, height } = image;
  if (mask.width !== width || mask.height !== height) {
    throw new Error('The letterhead image and its mask have different sizes.');
  }

  const alpha = (x: number, y: number): number => mask.data[(y * width + x) * 4] ?? 0;
  const lut = Array.from({ length: 256 }, (_, v) => adobeRgbToLinear(v / 255));

  const labs = new Float32Array(width * height * 3);
  const rgbs = new Uint8Array(width * height * 3);
  const stored = new Uint8Array(width * height * 3);
  let count = 0;
  let clippedPixels = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let interior = true;
      for (let dy = -1; dy <= 1 && interior; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (alpha(x + dx, y + dy) !== 255) {
            interior = false;
            break;
          }
        }
      }
      if (!interior) continue;

      const p = (y * width + x) * 4;
      const [lr, lg, lb] = linearAdobeRgbToLinearSrgb(
        lut[image.data[p] ?? 0] ?? 0,
        lut[image.data[p + 1] ?? 0] ?? 0,
        lut[image.data[p + 2] ?? 0] ?? 0,
      );
      if ([lr, lg, lb].some((v) => v < -1e-6 || v > 1 + 1e-6)) clippedPixels++;
      const cr = Math.min(1, Math.max(0, lr));
      const cg = Math.min(1, Math.max(0, lg));
      const cb = Math.min(1, Math.max(0, lb));
      const lab = linearSrgbToOklab(cr, cg, cb);
      labs[count * 3] = lab.l;
      labs[count * 3 + 1] = lab.a;
      labs[count * 3 + 2] = lab.b;
      rgbs[count * 3] = Math.round(linearToSrgb(cr) * 255);
      rgbs[count * 3 + 1] = Math.round(linearToSrgb(cg) * 255);
      rgbs[count * 3 + 2] = Math.round(linearToSrgb(cb) * 255);
      stored.set(image.data.subarray(p, p + 3), count * 3);
      count++;
    }
  }

  return {
    profile: 'Adobe RGB (1998)',
    clippedPixels,
    clusters: cluster(labs, rgbs, count, { sources: { space: 'Adobe RGB (1998)', bytes: stored } }),
    translucentLayer: analyzeTranslucentLayer(image, mask, smaskMatte(readFileSync(pdfPath))),
  };
}

/**
 * Reads the /Matte entry of the image's soft mask, if any. A matte means the
 * stored colors were already blended with that color ("premultiplied"), so the
 * stored value is what shows on paper of that color, and the original ink has
 * to be recovered by undoing the blend (PDF 32000-1, section 11.6.5.3).
 */
function smaskMatte(pdf: Buffer): number[] | null {
  const m = /\/Matte\s*\[([^\]]*)\]/.exec(pdf.toString('latin1'));
  if (!m?.[1]) return null;
  const values = m[1].trim().split(/\s+/).map(Number);
  return values.length === 3 && values.every((v) => Number.isFinite(v)) ? values : null;
}

/**
 * The watermark is not opaque ink: it is a flat layer at partial opacity (one
 * alpha value over a large area). We report both what the reader sees on white
 * paper and the ink behind it. With a white matte the stored color already IS
 * the color on paper; blending it again would double-count the transparency.
 */
function analyzeTranslucentLayer(
  image: PNG,
  mask: PNG,
  matte: number[] | null,
): TranslucentLayer | null {
  const { width, height } = image;
  const alphaCounts = new Uint32Array(256);
  for (let i = 0; i < width * height; i++) {
    const a = mask.data[i * 4] ?? 0;
    alphaCounts[a] = (alphaCounts[a] ?? 0) + 1;
  }
  let layerAlpha = -1;
  for (let a = 1; a < 255; a++) {
    if ((alphaCounts[a] ?? 0) > (alphaCounts[layerAlpha] ?? 0)) layerAlpha = a;
  }
  if (layerAlpha < 0 || (alphaCounts[layerAlpha] ?? 0) < width * height * 0.01) return null;

  const opacity = layerAlpha / 255;
  const n = alphaCounts[layerAlpha] ?? 0;
  const inkLabs = new Float32Array(n * 3);
  const inkRgbs = new Uint8Array(n * 3);
  const seenLabs = new Float32Array(n * 3);
  const seenRgbs = new Uint8Array(n * 3);
  let count = 0;

  // Gamma-encoded Adobe RGB triplet -> clamped linear sRGB and encoded sRGB.
  const toSrgb = (encoded: number[]): { linear: number[]; srgb: number[] } => {
    const linear = linearAdobeRgbToLinearSrgb(
      adobeRgbToLinear(encoded[0] ?? 0),
      adobeRgbToLinear(encoded[1] ?? 0),
      adobeRgbToLinear(encoded[2] ?? 0),
    ).map((v) => Math.min(1, Math.max(0, v)));
    return { linear, srgb: linear.map(linearToSrgb) };
  };

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let flat = true;
      for (let dy = -1; dy <= 1 && flat; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((mask.data[((y + dy) * width + x + dx) * 4] ?? 0) !== layerAlpha) {
            flat = false;
            break;
          }
        }
      }
      if (!flat) continue;

      const p = (y * width + x) * 4;
      const stored = [0, 1, 2].map((c) => (image.data[p + c] ?? 0) / 255);

      let ink: { linear: number[]; srgb: number[] };
      let seen: number[];
      if (matte) {
        // Undo the premultiplication in the image's own color space.
        ink = toSrgb(
          stored.map((v, c) =>
            Math.min(1, Math.max(0, (matte[c] ?? 1) + (v - (matte[c] ?? 1)) / opacity)),
          ),
        );
        seen = toSrgb(stored).srgb;
      } else {
        ink = toSrgb(stored);
        seen = ink.srgb.map((v) => opacity * v + (1 - opacity));
      }

      const inkLab = linearSrgbToOklab(ink.linear[0] ?? 0, ink.linear[1] ?? 0, ink.linear[2] ?? 0);
      const seenLab = rgbToOklab({ r: seen[0] ?? 0, g: seen[1] ?? 0, b: seen[2] ?? 0 });
      inkLabs.set([inkLab.l, inkLab.a, inkLab.b], count * 3);
      seenLabs.set([seenLab.l, seenLab.a, seenLab.b], count * 3);
      inkRgbs.set(
        ink.srgb.map((v) => Math.round(v * 255)),
        count * 3,
      );
      seenRgbs.set(
        seen.map((v) => Math.round(v * 255)),
        count * 3,
      );
      count++;
    }
  }

  return {
    alpha: layerAlpha,
    opacity: round(opacity),
    matte,
    ink: cluster(inkLabs, inkRgbs, count),
    onWhite: cluster(seenLabs, seenRgbs, count),
  };
}

// ---------------------------------------------------------------------------
// Social posts
// ---------------------------------------------------------------------------

function readPng(file: string): PNG {
  return PNG.sync.read(readFileSync(join(BRAND, file)));
}

/** The most frequent exact colors inside a region: flat overlays win by a mile. */
function exactColors(png: PNG, region: { x: number; y: number; w: number; h: number }) {
  const counts = new Map<number, number>();
  let total = 0;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      const p = (y * png.width + x) * 4;
      const key =
        ((png.data[p] ?? 0) << 16) | ((png.data[p + 1] ?? 0) << 8) | (png.data[p + 2] ?? 0);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 5)
    .map(([key, n]) => {
      const r = (key >> 16) & 255;
      const g = (key >> 8) & 255;
      const b = key & 255;
      return {
        hex: byteHex(r, g, b),
        oklch: oklchOf(rgbToOklab({ r: r / 255, g: g / 255, b: b / 255 })),
        pixels: n,
        share: round(n / total),
      };
    });
}

/** Photographic reference palette of a whole post (every 2nd pixel). */
function photoClusters(png: PNG): Cluster[] {
  const n = Math.ceil(png.width / 2) * Math.ceil(png.height / 2);
  const labs = new Float32Array(n * 3);
  const rgbs = new Uint8Array(n * 3);
  let count = 0;
  for (let y = 0; y < png.height; y += 2) {
    for (let x = 0; x < png.width; x += 2) {
      const p = (y * png.width + x) * 4;
      const r = png.data[p] ?? 0;
      const g = png.data[p + 1] ?? 0;
      const b = png.data[p + 2] ?? 0;
      const lab = rgbToOklab({ r: r / 255, g: g / 255, b: b / 255 });
      labs[count * 3] = lab.l;
      labs[count * 3 + 1] = lab.a;
      labs[count * 3 + 2] = lab.b;
      rgbs[count * 3] = r;
      rgbs[count * 3 + 1] = g;
      rgbs[count * 3 + 2] = b;
      count++;
    }
  }
  return cluster(labs, rgbs, count, { mergeDistance: 0.08, minBinShare: 0.004 }).slice(0, 6);
}

// ---------------------------------------------------------------------------
// Roles: which extracted color is which brand color
// ---------------------------------------------------------------------------

interface SpotColors {
  dark: string;
  light: string;
  spots: { name: string; lab: number[]; paperLab: number[]; hex: string }[];
}

/** brand/spot-colors.json, written by extract-vector.ts from the vector master. */
function readSpotColors(): SpotColors {
  try {
    return JSON.parse(readFileSync(join(BRAND, 'spot-colors.json'), 'utf8')) as SpotColors;
  } catch {
    throw new Error('Missing brand/spot-colors.json: run npm run brand:vector first.');
  }
}

/** A tint of a spot color as Illustrator renders it: Lab interpolation paper -> ink. */
function spotTint(spot: { lab: number[]; paperLab: number[] }, tint: number): string {
  const lab = [0, 1, 2].map(
    (i) => (spot.paperLab[i] ?? 0) + tint * ((spot.lab[i] ?? 0) - (spot.paperLab[i] ?? 0)),
  ) as [number, number, number];
  return toHex(labD50ToSrgb(lab).rgb);
}

/**
 * Which color is which. The vector master wins: it defines the brand as two
 * Pantone spot colors. The letterhead raster drifted slightly on export, so
 * its clusters stay in palette.json as evidence, with their distance to the
 * master, but they no longer set the anchors.
 */
function assignRoles(
  letterhead: Cluster[],
  layer: TranslucentLayer | null,
  overlays: Record<string, { hex: string }[]>,
) {
  const spotFile = readSpotColors();
  const dark = spotFile.spots.find((s) => s.name === spotFile.dark);
  const light = spotFile.spots.find((s) => s.name === spotFile.light);
  if (!dark || !light) throw new Error('brand/spot-colors.json is incomplete.');

  const darkest = [...letterhead].sort((a, b) => a.oklch.l - b.oklch.l)[0];
  const accent = letterhead.filter((c) => c.oklch.l > 0.6).sort((a, b) => b.oklch.c - a.oklch.c)[0];
  const distance = (a: string | undefined, b: string): number | null =>
    a ? round(deltaEOk(rgbToOklab(parseHex(a)), rgbToOklab(parseHex(b)))) : null;

  // The watermark is the light spot printed as a tint; its opacity is measured
  // from the letterhead's mask, not assumed.
  const opacity = layer?.opacity ?? 0.2;

  const headlineTops = Object.entries(overlays)
    .filter(([name]) => name.includes('titular'))
    .map(([, colors]) => colors[0]?.hex)
    .filter((hex): hex is string => typeof hex === 'string');
  const first = headlineTops[0];
  const agree =
    first !== undefined &&
    headlineTops.every(
      (hex) => deltaEOk(rgbToOklab(parseHex(hex)), rgbToOklab(parseHex(first))) < 0.01,
    );

  return {
    green: {
      hex: dark.hex,
      rule: `Vector master: spot color ${dark.name}, Lab (D50) to sRGB.`,
      letterhead: darkest?.hex,
      deltaEToLetterhead: distance(darkest?.hex, dark.hex),
    },
    peach: {
      hex: light.hex,
      rule: `Vector master: spot color ${light.name}, Lab (D50) to sRGB.`,
      letterhead: accent?.hex,
      deltaEToLetterhead: distance(accent?.hex, light.hex),
    },
    blush: {
      hex: spotTint(light, opacity),
      rule: `${light.name} at the watermark's tint (${Math.round(opacity * 100)}%, measured from the letterhead mask).`,
      letterhead: layer?.onWhite[0]?.hex,
    },
    salmon: {
      hex: headlineTops[0],
      rule: 'Posts: most frequent exact color in the headline regions.',
      consistentAcrossPosts: agree,
      perPost: headlineTops,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const files = [LETTERHEAD, 'EmpiricaLab_C1.png', 'EmpiricaLab_C2.png', 'EmpiricaLab_C3.png'];
  const sources = files.map((file) => ({
    file: `brand/${file}`,
    sha256: sha256(join(BRAND, file)),
  }));

  const letterhead = analyzeLetterhead();

  const pngs = new Map<string, PNG>();
  const png = (file: string): PNG => {
    const cached = pngs.get(file);
    if (cached) return cached;
    const loaded = readPng(file);
    pngs.set(file, loaded);
    return loaded;
  };

  const overlays: Record<string, ReturnType<typeof exactColors>> = {};
  for (const [name, region] of Object.entries(REGIONS)) {
    overlays[name] = exactColors(png(region.file), region);
  }

  const photographic: Record<string, Cluster[]> = {};
  for (const file of files.slice(1)) photographic[file] = photoClusters(png(file));

  const palette = {
    $comment:
      'Generated by scripts/brand/extract-palette.ts. Do not edit by hand: run npm run brand:palette.',
    sources,
    method: {
      letterhead:
        'pdfimages -> Adobe RGB (1998) to sRGB per pixel -> interior opaque pixels only -> OKLab clustering -> per-channel median.',
      overlays:
        'Most frequent exact sRGB value inside each region (posts are untagged PNG = sRGB).',
      photographic: 'OKLab clustering of every 2nd pixel. Reference only: lighting, not brand.',
    },
    letterhead,
    overlays,
    photographic,
    roles: assignRoles(letterhead.clusters, letterhead.translucentLayer, overlays),
  };

  writeFileSync(join(BRAND, 'palette.json'), `${JSON.stringify(palette, null, 2)}\n`);

  const line = (label: string, c: { hex: string; oklch: { css: string } }, extra = ''): void => {
    console.log(`  ${label.padEnd(44)} ${c.hex}  ${c.oklch.css}${extra}`);
  };
  console.log(
    `\nLetterhead (${letterhead.profile} -> sRGB, ${letterhead.clippedPixels} clipped px)`,
  );
  letterhead.clusters.forEach((c, i) => {
    line(
      `cluster ${i + 1}`,
      c,
      `  ${(c.share * 100).toFixed(1)}%  ${c.source ? `${c.source.space} ${c.source.rgb.join(',')}` : ''}`,
    );
  });
  const layer = letterhead.translucentLayer;
  if (layer) {
    console.log(
      `\nTranslucent layer (alpha ${layer.alpha} = ${(layer.opacity * 100).toFixed(0)}% opacity)`,
    );
    layer.ink.forEach((c, i) => {
      line(`ink ${i + 1}`, c, `  ${(c.share * 100).toFixed(1)}%`);
    });
    layer.onWhite.forEach((c, i) => {
      line(`seen on white ${i + 1}`, c, `  ${(c.share * 100).toFixed(1)}%`);
    });
  }
  console.log('\nOverlays (exact values)');
  for (const [name, colors] of Object.entries(overlays)) {
    const top = colors[0];
    if (top) line(name, top, `  ${(top.share * 100).toFixed(1)}% of region`);
  }
  console.log('\nRoles');
  for (const [role, value] of Object.entries(palette.roles)) {
    console.log(`  ${role.padEnd(8)} ${value.hex}  — ${value.rule}`);
  }
  console.log('\nWrote brand/palette.json');
}

main();
