#!/usr/bin/env node
/**
 * Builds the design tokens from the colors extracted out of /brand.
 *
 *   npm run brand:tokens
 *
 * Inputs:  brand/palette.json (written by extract-palette.ts)
 * Outputs: packages/shared/src/brand/tokens.json  (source of truth for code)
 *          apps/web/src/styles/tokens.css         (CSS custom properties)
 *          docs/design/paleta-propuesta.html      (visual proposal to approve)
 *
 * No color here is typed by hand. The four brand colors come from the files;
 * every other value is derived from them by a rule written below (a lightness
 * target, a chroma multiple, a hue rotation), so a change is a change of rule,
 * reviewable in a diff, never a mystery hex. White paper (#ffffff) is the only
 * literal: it is the letterhead's own paper.
 *
 * Status hues (green / amber / red) do not exist in the brand. They follow the
 * universal traffic-light convention and are flagged as such in the proposal.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contrastRatio,
  formatOklch,
  hexToOklch,
  maxChroma,
  oklchToHex,
  parseHex,
  type Oklch,
} from '../../packages/shared/src/brand/color.ts';
import {
  CHART_RULES,
  deltaE100,
  validateCategorical,
  type CategoricalReport,
  type ThemeMode,
} from '../../packages/shared/src/brand/chart-palette.ts';
import {
  CONTRAST_REQUIREMENTS,
  RAMP_STEPS,
  resolveToken,
  tokensToCss,
  type BrandTokens,
  type RampStep,
  type SemanticColor,
  type StatusPart,
  type StatusTone,
  type ThemeTokens,
} from '../../packages/shared/src/brand/tokens.ts';
import { renderPreview } from './preview.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAPER = '#ffffff';

// ---------------------------------------------------------------------------
// Brand anchors (from the files)
// ---------------------------------------------------------------------------

interface Palette {
  roles: Record<'green' | 'peach' | 'blush' | 'salmon', { hex: string }>;
  letterhead: { clusters: { hex: string; source?: { space: string; rgb: number[] } }[] };
}
const palette = JSON.parse(readFileSync(join(ROOT, 'brand', 'palette.json'), 'utf8')) as Palette;
const brand = {
  green: palette.roles.green.hex,
  peach: palette.roles.peach.hex,
  salmon: palette.roles.salmon.hex,
  blush: palette.roles.blush.hex,
};
const G = hexToOklch(brand.green);
const P = hexToOklch(brand.peach);
const B = hexToOklch(brand.blush);

/** OKLCH -> hex, never asking for more chroma than sRGB can show. */
const lch = (l: number, c: number, h: number): string =>
  oklchToHex({ l, c: Math.min(c, maxChroma(l, h)), h });

// ---------------------------------------------------------------------------
// Ramps: shared lightness targets; chroma as a multiple of the anchor's
// ---------------------------------------------------------------------------

type Ramp = Record<RampStep, string>;

function ramp(
  hue: number,
  lightness: Record<RampStep, number>,
  chroma: Record<RampStep, number>,
  exact: Partial<Record<RampStep, string>> = {},
): Ramp {
  const out = {} as Ramp;
  for (const step of RAMP_STEPS) out[step] = exact[step] ?? lch(lightness[step], chroma[step], hue);
  return out;
}

const scale = (base: number, factors: Record<RampStep, number>): Record<RampStep, number> =>
  Object.fromEntries(RAMP_STEPS.map((s) => [s, base * factors[s]])) as Record<RampStep, number>;

// Green: brand green is step 900. Mid steps get more chroma so the teal stays
// recognizable once lightened; the ends taper toward neutral.
const greenRamp = ramp(
  G.h,
  {
    '50': 0.975,
    '100': 0.945,
    '200': 0.89,
    '300': 0.81,
    '400': 0.72,
    '500': 0.62,
    '600': 0.52,
    '700': 0.43,
    '800': 0.35,
    '900': G.l,
    '950': 0.21,
  },
  scale(G.c, {
    '50': 0.25,
    '100': 0.4,
    '200': 0.7,
    '300': 1.1,
    '400': 1.5,
    '500': 1.75,
    '600': 1.75,
    '700': 1.55,
    '800': 1.25,
    '900': 1,
    '950': 0.85,
  }),
  { '900': brand.green },
);

// Accent: blush (50), salmon (300) and peach (400) are the brand's own values;
// the rest follow the peach hue, deepening into terracotta for text use.
const accentRamp = ramp(
  P.h,
  {
    '50': B.l,
    '100': 0.93,
    '200': 0.885,
    '300': 0.829,
    '400': P.l,
    '500': 0.66,
    '600': 0.57,
    '700': 0.48,
    '800': 0.4,
    '900': 0.33,
    '950': 0.26,
  },
  scale(P.c, {
    '50': 0.2,
    '100': 0.4,
    '200': 0.75,
    '300': 0.9,
    '400': 1,
    '500': 1.2,
    '600': 1.3,
    '700': 1.25,
    '800': 1.1,
    '900': 0.95,
    '950': 0.8,
  }),
  { '50': brand.blush, '300': brand.salmon, '400': brand.peach },
);

// Neutrals: warm "paper" grays on the watermark's hue, at very low chroma.
// The brand photography's backgrounds sit in the same family (h 33-56, C ~0.012).
const neutralRamp = ramp(
  B.h,
  {
    '50': 0.985,
    '100': 0.962,
    '200': 0.925,
    '300': 0.87,
    '400': 0.72,
    '500': 0.6,
    '600': 0.505,
    '700': 0.42,
    '800': 0.33,
    '900': 0.245,
    '950': 0.175,
  },
  {
    '50': 0.004,
    '100': 0.006,
    '200': 0.008,
    '300': 0.009,
    '400': 0.01,
    '500': 0.01,
    '600': 0.01,
    '700': 0.009,
    '800': 0.008,
    '900': 0.007,
    '950': 0.006,
  },
);

// Dark-mode "night" surfaces: the brand green's hue, very dark, barely chromatic.
const night = (l: number, c = 0.018): string => lch(l, c, G.h);

// ---------------------------------------------------------------------------
// Semantic colors
// ---------------------------------------------------------------------------

const light: Record<SemanticColor, string> = {
  background: neutralRamp['50'],
  foreground: neutralRamp['900'],
  heading: greenRamp['900'],
  card: PAPER,
  'card-foreground': neutralRamp['900'],
  popover: PAPER,
  'popover-foreground': neutralRamp['900'],
  muted: neutralRamp['100'],
  'muted-foreground': neutralRamp['600'],
  primary: greenRamp['900'],
  'primary-foreground': brand.blush,
  'primary-hover': greenRamp['800'],
  secondary: neutralRamp['100'],
  'secondary-foreground': greenRamp['900'],
  accent: brand.blush,
  'accent-foreground': greenRamp['900'],
  'accent-strong': brand.peach,
  'accent-strong-foreground': greenRamp['900'],
  border: neutralRamp['200'],
  input: neutralRamp['500'],
  ring: greenRamp['600'],
  link: greenRamp['700'],
  // Navigation chrome wears the brand: green like the business card, peach marks.
  sidebar: greenRamp['900'],
  'sidebar-foreground': brand.blush,
  'sidebar-muted-foreground': greenRamp['200'],
  'sidebar-accent': brand.peach,
  'sidebar-border': greenRamp['800'],
};

const dark: Record<SemanticColor, string> = {
  background: night(0.17),
  foreground: neutralRamp['100'],
  heading: neutralRamp['50'],
  card: night(0.205, 0.02),
  'card-foreground': neutralRamp['100'],
  popover: night(0.225, 0.02),
  'popover-foreground': neutralRamp['100'],
  muted: night(0.245, 0.02),
  'muted-foreground': neutralRamp['400'],
  primary: greenRamp['300'],
  'primary-foreground': greenRamp['950'],
  'primary-hover': greenRamp['200'],
  secondary: night(0.245, 0.02),
  'secondary-foreground': neutralRamp['100'],
  accent: lch(0.27, 0.03, P.h),
  'accent-foreground': brand.salmon,
  'accent-strong': brand.peach,
  'accent-strong-foreground': greenRamp['950'],
  border: night(0.31, 0.02),
  input: neutralRamp['500'],
  ring: greenRamp['400'],
  link: greenRamp['300'],
  // Darker than the page so the chrome recedes instead of glowing.
  sidebar: night(0.135, 0.02),
  'sidebar-foreground': neutralRamp['100'],
  'sidebar-muted-foreground': neutralRamp['400'],
  'sidebar-accent': brand.peach,
  'sidebar-border': night(0.26, 0.02),
};

// ---------------------------------------------------------------------------
// Status (traffic light). Hues are the universal convention, not the brand's.
// ---------------------------------------------------------------------------

const STATUS_HUE: Record<Exclude<StatusTone, 'neutral'>, number> = {
  success: 150,
  warning: 70,
  danger: 27,
  info: G.h,
};

function statusLight(tone: StatusTone): Record<StatusPart, string> {
  if (tone === 'neutral') {
    return {
      solid: neutralRamp['600'],
      'solid-foreground': PAPER,
      subtle: neutralRamp['100'],
      'on-subtle': neutralRamp['800'],
      border: neutralRamp['300'],
    };
  }
  const h = STATUS_HUE[tone];
  // Warning is an ochre, not a yellow: a yellow light enough to look yellow
  // cannot reach 3:1 on white, and status icons must.
  const solidL = tone === 'warning' ? 0.6 : 0.52;
  return {
    solid: lch(solidL, 0.14, h),
    'solid-foreground': tone === 'warning' ? neutralRamp['950'] : PAPER,
    subtle: lch(0.965, 0.022, h),
    'on-subtle': lch(0.4, 0.11, h),
    border: lch(0.83, 0.06, h),
  };
}

function statusDark(tone: StatusTone): Record<StatusPart, string> {
  if (tone === 'neutral') {
    return {
      solid: neutralRamp['400'],
      'solid-foreground': dark.background,
      subtle: night(0.245, 0.02),
      'on-subtle': neutralRamp['200'],
      border: night(0.38, 0.02),
    };
  }
  const h = STATUS_HUE[tone];
  return {
    solid: lch(0.72, 0.13, h),
    'solid-foreground': dark.background,
    subtle: lch(0.27, 0.045, h),
    'on-subtle': lch(0.88, 0.07, h),
    border: lch(0.45, 0.07, h),
  };
}

const TONES: StatusTone[] = ['success', 'warning', 'danger', 'info', 'neutral'];
const statusOf = (fn: (t: StatusTone) => Record<StatusPart, string>) =>
  Object.fromEntries(TONES.map((t) => [t, fn(t)])) as Record<
    StatusTone,
    Record<StatusPart, string>
  >;

// ---------------------------------------------------------------------------
// Chart palette: eight hues anchored at the brand green, searched and validated
// ---------------------------------------------------------------------------

// A wheel of eight hues 45 degrees apart starting at the brand green's hue.
// The one that lands nearest the brand peach is replaced by the peach's exact
// hue, so the first two series are the brand's two colors.
const wheel = Array.from({ length: 8 }, (_, k) => (G.h + 45 * k) % 360);
const peachSlot = wheel.reduce(
  (best, h, k) => (Math.abs(h - P.h) < Math.abs((wheel[best] ?? 0) - P.h) ? k : best),
  0,
);
wheel[peachSlot] = P.h;

interface Candidate {
  hex: string;
  lch: Oklch;
}

// A law firm, not a game: chroma stays just above the floor that keeps a hue
// from reading as gray (0.10), well below what the gamut would allow.
const CHROMA_CAP: Record<ThemeMode, number> = { light: 0.135, dark: 0.125 };

function candidates(h: number, mode: ThemeMode, surface: string): Candidate[] {
  // Light marks must reach 3:1 on white, which caps their lightness well
  // below the band's top; dark marks must reach 3:1 on the night card.
  const [from, to, step] = mode === 'light' ? [0.45, 0.66, 0.015] : [0.53, 0.67, 0.01];
  const out: Candidate[] = [];
  for (let l = from; l <= to + 1e-9; l += step) {
    const c = Math.min(maxChroma(l, h), CHROMA_CAP[mode]);
    if (c < CHART_RULES.chromaFloor + 0.005) continue;
    const hex = oklchToHex({ l, c, h });
    const actual = hexToOklch(hex);
    // Judge the rounded hex, not the ideal: 8-bit rounding can nudge L past the band.
    const [bandLo, bandHi] = CHART_RULES.band[mode];
    if (actual.l < bandLo || actual.l > bandHi || actual.c < CHART_RULES.chromaFloor) continue;
    if (contrastRatio(hex, surface) < CHART_RULES.contrastMin) continue;
    out.push({ hex, lch: actual });
  }
  return out;
}

/** How well two series separate, normalized so 1.0 = exactly at target. */
const pairCache = new Map<string, number>();
function pairScore(a: string, b: string): number {
  const key = a < b ? `${a}${b}` : `${b}${a}`;
  const cached = pairCache.get(key);
  if (cached !== undefined) return cached;
  const cvd = Math.min(deltaE100(a, b, 'protan'), deltaE100(a, b, 'deutan'));
  const score = Math.min(cvd / CHART_RULES.cvdTarget, deltaE100(a, b) / CHART_RULES.normalFloor);
  pairCache.set(key, score);
  return score;
}

/**
 * Best lightness per slot for a fixed hue order. The first three slots are
 * scored all-against-all (scatter plots and maps can put any of them side by
 * side); from the fourth on, only neighbors are compared (bars, stacks, lines).
 * Max-min dynamic programming over the chain.
 */
function bestChain(order: number[], pool: Candidate[][]): { score: number; picks: Candidate[] } {
  const slots = order.map((k) => pool[k] ?? []);
  const [s0 = [], s1 = [], s2 = []] = slots;
  let best = s2.map((c3) => {
    let top = { score: Number.NEGATIVE_INFINITY, path: [] as Candidate[] };
    for (const c1 of s0) {
      for (const c2 of s1) {
        const s = Math.min(
          pairScore(c1.hex, c2.hex),
          pairScore(c2.hex, c3.hex),
          pairScore(c1.hex, c3.hex),
        );
        if (s > top.score) top = { score: s, path: [c1, c2, c3] };
      }
    }
    return top;
  });
  for (let i = 3; i < slots.length; i++) {
    best = (slots[i] ?? []).map((c) => {
      let top = { score: Number.NEGATIVE_INFINITY, path: [] as Candidate[] };
      for (const prev of best) {
        const last = prev.path[prev.path.length - 1];
        if (!last) continue;
        const s = Math.min(prev.score, pairScore(last.hex, c.hex));
        if (s > top.score) top = { score: s, path: [...prev.path, c] };
      }
      return top;
    });
  }
  return best.reduce((x, y) => (y.score > x.score ? { score: y.score, picks: y.path } : x), {
    score: Number.NEGATIVE_INFINITY,
    picks: [] as Candidate[],
  });
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]),
  );
}

function searchChartPalette(): {
  order: number[];
  light: string[];
  dark: string[];
  score: { light: number; dark: number };
} {
  const poolLight = wheel.map((h) => candidates(h, 'light', light.card));
  const poolDark = wheel.map((h) => candidates(h, 'dark', dark.card));
  const rest = wheel.map((_, k) => k).filter((k) => k !== 0 && k !== peachSlot);

  let winner = {
    order: [] as number[],
    light: [] as string[],
    dark: [] as string[],
    score: { light: 0, dark: 0 },
  };
  let winnerScore = Number.NEGATIVE_INFINITY;
  for (const perm of permutations(rest)) {
    const order = [0, peachSlot, ...perm];
    const l = bestChain(order, poolLight);
    const d = bestChain(order, poolDark);
    const score = Math.min(l.score, d.score);
    if (score > winnerScore) {
      winnerScore = score;
      winner = {
        order,
        light: l.picks.map((c) => c.hex),
        dark: d.picks.map((c) => c.hex),
        score: { light: l.score, dark: d.score },
      };
    }
  }
  return winner;
}

const chart = searchChartPalette();

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

const green = (s: RampStep): string => greenRamp[s];
const themes: Record<ThemeMode, ThemeTokens> = {
  light: {
    colors: light,
    status: statusOf(statusLight),
    chart: {
      surface: light.card,
      categorical: chart.light,
      sequential: (['100', '200', '300', '400', '500', '600', '700'] as RampStep[]).map(green),
    },
  },
  dark: {
    colors: dark,
    status: statusOf(statusDark),
    chart: {
      surface: dark.card,
      categorical: chart.dark,
      // In dark mode "near zero" recedes into the night surface: dark -> light.
      sequential: (['800', '700', '600', '500', '400', '300', '200'] as RampStep[]).map(green),
    },
  },
};

const shadowInk = parseHex(greenRamp['950']);
const rgb = (a: number): string =>
  `rgb(${Math.round(shadowInk.r * 255)} ${Math.round(shadowInk.g * 255)} ${Math.round(shadowInk.b * 255)} / ${a})`;

const tokens: BrandTokens = {
  $comment:
    'Generated by scripts/brand/build-tokens.ts from brand/palette.json. Do not edit by hand.',
  brand,
  ramps: { green: greenRamp, accent: accentRamp, neutral: neutralRamp },
  themes,
  typography: {
    display: {
      family: "'Cormorant Garamond Variable'",
      fallback: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
    },
    sans: {
      family: "'Montserrat Variable'",
      fallback: "'Montserrat', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    },
    label: {
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      fontWeight: 600,
      fontSize: '0.75rem',
    },
  },
  radius: { control: '0.625rem', card: '1rem', panel: '1.5rem', pill: '9999px' },
  shadow: {
    sm: `0 1px 2px 0 ${rgb(0.06)}, 0 1px 1px 0 ${rgb(0.04)}`,
    md: `0 4px 12px -2px ${rgb(0.08)}, 0 2px 4px -2px ${rgb(0.05)}`,
    lg: `0 16px 32px -8px ${rgb(0.12)}, 0 4px 8px -4px ${rgb(0.06)}`,
  },
};

// ---------------------------------------------------------------------------
// Checks: contrast for every declared pair, chart validation in both modes
// ---------------------------------------------------------------------------

export interface ContrastRow {
  mode: ThemeMode;
  fg: string;
  bg: string;
  fgHex: string;
  bgHex: string;
  ratio: number;
  min: number;
  use: string;
  pass: boolean;
}

const contrastRows: ContrastRow[] = (['light', 'dark'] as const).flatMap((mode) =>
  CONTRAST_REQUIREMENTS.map((req) => {
    const fgHex = resolveToken(themes[mode], req.fg);
    const bgHex = resolveToken(themes[mode], req.bg);
    const ratio = contrastRatio(fgHex, bgHex);
    return {
      mode,
      fg: req.fg,
      bg: req.bg,
      fgHex,
      bgHex,
      ratio,
      min: req.min,
      use: req.use,
      pass: ratio >= req.min,
    };
  }),
);

const chartReports: Record<
  ThemeMode,
  { adjacent: CategoricalReport; firstThreeAllPairs: CategoricalReport }
> = {
  light: {
    adjacent: validateCategorical(chart.light, { mode: 'light', surface: light.card }),
    firstThreeAllPairs: validateCategorical(chart.light.slice(0, 3), {
      mode: 'light',
      surface: light.card,
      pairs: 'all',
    }),
  },
  dark: {
    adjacent: validateCategorical(chart.dark, { mode: 'dark', surface: dark.card }),
    firstThreeAllPairs: validateCategorical(chart.dark.slice(0, 3), {
      mode: 'dark',
      surface: dark.card,
      pairs: 'all',
    }),
  },
};

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function write(relative: string, content: string): void {
  const file = join(ROOT, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log(`  wrote ${relative}`);
}

console.log('\nBrand anchors');
for (const [name, hex] of Object.entries(brand)) {
  console.log(`  ${name.padEnd(7)} ${hex}  ${formatOklch(hexToOklch(hex))}`);
}

console.log('\nChart palette (hue order and steps found by search)');
console.log(`  hues    ${chart.order.map((k) => (wheel[k] ?? 0).toFixed(1)).join(', ')}`);
console.log(`  light   ${chart.light.join(', ')}`);
console.log(`  dark    ${chart.dark.join(', ')}`);
for (const mode of ['light', 'dark'] as const) {
  const r = chartReports[mode].adjacent;
  const a = chartReports[mode].firstThreeAllPairs;
  console.log(
    `  ${mode.padEnd(6)} adjacent: ${r.ok ? 'PASS' : 'FAIL'}  worst CVD ${r.worstCvd.value.toFixed(1)} ` +
      `(${r.worstCvd.kind}), worst normal ${r.worstNormal.value.toFixed(1)}; ` +
      `first three all-pairs: ${a.ok ? 'PASS' : 'FAIL'} (CVD ${a.worstCvd.value.toFixed(1)}, normal ${a.worstNormal.value.toFixed(1)})`,
  );
}

const failures = contrastRows.filter((r) => !r.pass);
console.log(
  `\nContrast: ${contrastRows.length - failures.length}/${contrastRows.length} pairs pass WCAG 2.2 AA`,
);
for (const f of failures) {
  console.log(`  FAIL ${f.mode} ${f.fg} on ${f.bg}: ${f.ratio.toFixed(2)} < ${f.min} (${f.use})`);
}

console.log('');
write('packages/shared/src/brand/tokens.json', `${JSON.stringify(tokens, null, 2)}\n`);
write('apps/web/src/styles/tokens.css', tokensToCss(tokens));
write(
  'docs/design/paleta-propuesta.html',
  renderPreview({ tokens, palette, wheel, chartOrder: chart.order, chartReports, contrastRows }),
);

if (failures.length || !chartReports.light.adjacent.ok || !chartReports.dark.adjacent.ok) {
  console.error('\nSome checks failed: fix the recipe before approving these tokens.');
  process.exitCode = 1;
}
