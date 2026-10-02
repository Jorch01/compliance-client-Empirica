/**
 * Color math for the brand palette: color-space conversion, OKLab/OKLCH and
 * WCAG 2.x contrast.
 *
 * Pure functions with no DOM or Node APIs, so the exact same code runs in the
 * palette extraction script (Node), in the web app and in the tests. Keeping a
 * single implementation matters: a contrast check that disagrees with the
 * script that produced the colors would approve palettes that fail in the UI.
 */

/** Gamma-encoded sRGB, each channel in [0, 1]. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Oklab {
  l: number;
  a: number;
  b: number;
}

/** OKLCH: lightness [0, 1], chroma (>= 0, ~0.4 max in sRGB), hue in degrees. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

function multiply(m: Matrix3, v: readonly [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function multiplyMatrices(a: Matrix3, b: Matrix3): Matrix3 {
  const col = (j: 0 | 1 | 2): [number, number, number] => [b[0][j], b[1][j], b[2][j]];
  const c0 = multiply(a, col(0));
  const c1 = multiply(a, col(1));
  const c2 = multiply(a, col(2));
  return [
    [c0[0], c1[0], c2[0]],
    [c0[1], c1[1], c2[1]],
    [c0[2], c1[2], c2[2]],
  ];
}

// ---------------------------------------------------------------------------
// Transfer functions
// ---------------------------------------------------------------------------

/** sRGB electro-optical transfer function (IEC 61966-2-1). */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/**
 * Adobe RGB (1998) uses a pure power curve with gamma 563/256 (Adobe RGB (1998)
 * Color Image Encoding, section 4.3.1.2). The firm's letterhead is encoded in
 * this space, so reading its pixels as if they were sRGB shifts every color.
 */
export const ADOBE_RGB_GAMMA = 563 / 256;

export function adobeRgbToLinear(v: number): number {
  return v <= 0 ? 0 : v ** ADOBE_RGB_GAMMA;
}

// ---------------------------------------------------------------------------
// Adobe RGB (1998) -> sRGB
// ---------------------------------------------------------------------------

// Both spaces use the D65 white point, so going through XYZ needs no chromatic
// adaptation. Matrices from the respective specifications (as tabulated by
// Bruce Lindbloom).
const ADOBE_RGB_TO_XYZ: Matrix3 = [
  [0.5767309, 0.185554, 0.1881852],
  [0.2973769, 0.6273491, 0.0752741],
  [0.0270343, 0.0706872, 0.9911085],
];

const XYZ_TO_LINEAR_SRGB: Matrix3 = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];

const ADOBE_RGB_TO_LINEAR_SRGB = multiplyMatrices(XYZ_TO_LINEAR_SRGB, ADOBE_RGB_TO_XYZ);

/** Linear Adobe RGB -> linear sRGB. The result may fall outside [0, 1]. */
export function linearAdobeRgbToLinearSrgb(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  return multiply(ADOBE_RGB_TO_LINEAR_SRGB, [r, g, b]);
}

/**
 * Gamma-encoded Adobe RGB (1998) -> gamma-encoded sRGB. Colors outside the
 * sRGB gamut are clipped and reported, so the caller can tell the user that
 * the screen version of that color is an approximation.
 */
export function adobeRgbToSrgb(color: Rgb): { rgb: Rgb; clipped: boolean } {
  const [lr, lg, lb] = linearAdobeRgbToLinearSrgb(
    adobeRgbToLinear(color.r),
    adobeRgbToLinear(color.g),
    adobeRgbToLinear(color.b),
  );
  const eps = 1e-6;
  const clipped = [lr, lg, lb].some((v) => v < -eps || v > 1 + eps);
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  return {
    rgb: { r: linearToSrgb(clamp(lr)), g: linearToSrgb(clamp(lg)), b: linearToSrgb(clamp(lb)) },
    clipped,
  };
}

// ---------------------------------------------------------------------------
// OKLab / OKLCH (Björn Ottosson, 2020)
// ---------------------------------------------------------------------------

export function linearSrgbToOklab(r: number, g: number, b: number): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToLinearSrgb(lab: Oklab): [number, number, number] {
  const l = (lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3;
  const m = (lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3;
  const s = (lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function rgbToOklab(color: Rgb): Oklab {
  return linearSrgbToOklab(srgbToLinear(color.r), srgbToLinear(color.g), srgbToLinear(color.b));
}

export function oklabToOklch(lab: Oklab): Oklch {
  const c = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: lab.l, c, h };
}

export function oklchToOklab(lch: Oklch): Oklab {
  const rad = (lch.h * Math.PI) / 180;
  return { l: lch.l, a: lch.c * Math.cos(rad), b: lch.c * Math.sin(rad) };
}

export function rgbToOklch(color: Rgb): Oklch {
  return oklabToOklch(rgbToOklab(color));
}

/** Euclidean distance in OKLab ("deltaE OK"). About 0.02 is a just-noticeable difference. */
export function deltaEOk(x: Oklab, y: Oklab): number {
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

function inGamut(linear: readonly [number, number, number]): boolean {
  const eps = 1e-7;
  return linear.every((v) => v >= -eps && v <= 1 + eps);
}

/**
 * OKLCH -> sRGB, keeping lightness and hue and reducing chroma only as much as
 * needed to land inside the sRGB gamut (binary search, as in CSS Color 4's
 * gamut mapping). Derived tints never silently change hue this way.
 */
export function oklchToRgb(lch: Oklch): Rgb {
  const toRgb = (linear: readonly [number, number, number]): Rgb => {
    const clamp = (v: number): number => Math.min(1, Math.max(0, v));
    return {
      r: linearToSrgb(clamp(linear[0])),
      g: linearToSrgb(clamp(linear[1])),
      b: linearToSrgb(clamp(linear[2])),
    };
  };

  const direct = oklabToLinearSrgb(oklchToOklab(lch));
  if (inGamut(direct)) return toRgb(direct);

  let lo = 0;
  let hi = lch.c;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToLinearSrgb(oklchToOklab({ ...lch, c: mid })))) lo = mid;
    else hi = mid;
  }
  return toRgb(oklabToLinearSrgb(oklchToOklab({ ...lch, c: lo })));
}

/** Largest chroma that stays inside the sRGB gamut at this lightness and hue. */
export function maxChroma(l: number, h: number): number {
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToLinearSrgb(oklchToOklab({ l, c: mid, h })))) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Hex helpers
// ---------------------------------------------------------------------------

export function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) throw new Error(`Not a #rrggbb color: "${hex}"`);
  const n = Number.parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function toHex(color: Rgb): string {
  const byte = (v: number): string =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(color.r)}${byte(color.g)}${byte(color.b)}`;
}

export function hexToOklch(hex: string): Oklch {
  return rgbToOklch(parseHex(hex));
}

export function oklchToHex(lch: Oklch): string {
  return toHex(oklchToRgb(lch));
}

/** CSS `oklch()` notation, handy for docs and previews. */
export function formatOklch(lch: Oklch): string {
  return `oklch(${(lch.l * 100).toFixed(1)}% ${lch.c.toFixed(3)} ${lch.h.toFixed(1)})`;
}

// ---------------------------------------------------------------------------
// WCAG 2.x contrast
// ---------------------------------------------------------------------------

/** Relative luminance as defined by WCAG 2.x. */
export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b)
  );
}

/** WCAG 2.x contrast ratio between two colors, from 1 to 21. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(typeof a === 'string' ? parseHex(a) : a);
  const lb = relativeLuminance(typeof b === 'string' ? parseHex(b) : b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA thresholds: 4.5 for body text, 3 for large text and UI components. */
export const WCAG_AA = { text: 4.5, largeText: 3, ui: 3 } as const;
