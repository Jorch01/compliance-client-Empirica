/**
 * Checks for categorical chart palettes (series identity).
 *
 * A palette is accepted only if it passes checks that can be computed, never
 * eyeballed: lightness band per mode, chroma floor, separation between
 * neighboring series under simulated color-vision deficiency, separation under
 * normal vision, and contrast against the chart surface.
 *
 * CVD is simulated with Machado, Oliveira & Fernandes (2009) at severity 1.0
 * in linear sRGB; distances are Euclidean in OKLab x100. The thresholds are
 * calibrated to that model, so changing the model means recalibrating them.
 */
import { contrastRatio, linearSrgbToOklab, parseHex, srgbToLinear, type Oklab } from './color.ts';

export const CHART_RULES = {
  band: { light: [0.43, 0.77], dark: [0.48, 0.67] },
  chromaFloor: 0.1,
  cvdTarget: 8,
  cvdFloor: 6,
  normalFloor: 15,
  contrastMin: 3,
} as const;

export type CvdKind = 'protan' | 'deutan' | 'tritan';
export type ThemeMode = 'light' | 'dark';

type Row = readonly [number, number, number];
const MACHADO_2009: Record<CvdKind, readonly [Row, Row, Row]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function linearRgb(hex: string): [number, number, number] {
  const c = parseHex(hex);
  return [srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)];
}

/** OKLab of a color as seen with the given deficiency (or normal vision). */
export function perceivedOklab(hex: string, kind?: CvdKind): Oklab {
  const [r, g, b] = linearRgb(hex);
  if (!kind) return linearSrgbToOklab(r, g, b);
  const m = MACHADO_2009[kind];
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  const row = (k: Row): number => clamp(k[0] * r + k[1] * g + k[2] * b);
  return linearSrgbToOklab(row(m[0]), row(m[1]), row(m[2]));
}

/** OKLab distance x100 between two colors, optionally under simulated CVD. */
export function deltaE100(a: string, b: string, kind?: CvdKind): number {
  const x = perceivedOklab(a, kind);
  const y = perceivedOklab(b, kind);
  return 100 * Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

export interface PairScore {
  a: string;
  b: string;
  value: number;
}

export interface CategoricalReport {
  ok: boolean;
  /** Passing, but only legal with secondary encoding (labels, gaps or texture). */
  needsSecondaryEncoding: boolean;
  offBand: string[];
  lowChroma: string[];
  worstCvd: PairScore & { kind: CvdKind };
  worstNormal: PairScore;
  lowContrast: { color: string; ratio: number }[];
}

/**
 * Validates a categorical palette. `pairs: 'adjacent'` suits bars, stacks and
 * lines (only neighbors touch); `'all'` suits scatter, maps and small
 * multiples, where any two series can end up side by side.
 */
export function validateCategorical(
  palette: readonly string[],
  options: { mode: ThemeMode; surface: string; pairs?: 'adjacent' | 'all' },
): CategoricalReport {
  const { mode, surface, pairs = 'adjacent' } = options;
  const [lo, hi] = CHART_RULES.band[mode];

  const lch = palette.map((hex) => {
    const lab = perceivedOklab(hex);
    return { hex, l: lab.l, c: Math.hypot(lab.a, lab.b) };
  });
  const offBand = lch.filter((x) => x.l < lo || x.l > hi).map((x) => x.hex);
  const lowChroma = lch.filter((x) => x.c < CHART_RULES.chromaFloor).map((x) => x.hex);

  const pairList: [string, string][] = [];
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      if (pairs === 'all' || j === i + 1) pairList.push([palette[i] ?? '', palette[j] ?? '']);
    }
  }

  let worstCvd: PairScore & { kind: CvdKind } = {
    a: '',
    b: '',
    value: Number.POSITIVE_INFINITY,
    kind: 'protan',
  };
  let worstNormal: PairScore = { a: '', b: '', value: Number.POSITIVE_INFINITY };
  for (const [a, b] of pairList) {
    for (const kind of ['protan', 'deutan'] as const) {
      const value = deltaE100(a, b, kind);
      if (value < worstCvd.value) worstCvd = { a, b, value, kind };
    }
    const normal = deltaE100(a, b);
    if (normal < worstNormal.value) worstNormal = { a, b, value: normal };
  }

  const lowContrast = palette
    .map((color) => ({ color, ratio: contrastRatio(color, surface) }))
    .filter((x) => x.ratio < CHART_RULES.contrastMin);

  const cvdFails = worstCvd.value < CHART_RULES.cvdFloor;
  const normalFails = worstNormal.value < CHART_RULES.normalFloor;
  return {
    ok: !offBand.length && !lowChroma.length && !cvdFails && !normalFails,
    needsSecondaryEncoding: worstCvd.value < CHART_RULES.cvdTarget || lowContrast.length > 0,
    offBand,
    lowChroma,
    worstCvd,
    worstNormal,
    lowContrast,
  };
}
