import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHART_RULES, validateCategorical } from './chart-palette.ts';
import { contrastRatio, hexToOklch } from './color.ts';
import { tokens } from './index.ts';
import { CONTRAST_REQUIREMENTS, resolveToken, tokensToCss } from './tokens.ts';

const modes = ['light', 'dark'] as const;

describe('brand anchors', () => {
  it('are the colors extracted from the brand files', () => {
    const palette = JSON.parse(
      readFileSync(new URL('../../../../brand/palette.json', import.meta.url), 'utf8'),
    ) as { roles: Record<string, { hex: string }> };
    for (const role of ['green', 'peach', 'salmon', 'blush'] as const) {
      expect(tokens.brand[role]).toBe(palette.roles[role]?.hex);
    }
  });
});

describe.each(modes)('WCAG 2.2 AA in %s mode', (mode) => {
  it.each(CONTRAST_REQUIREMENTS.map((r) => [`${r.fg} on ${r.bg}`, r] as const))(
    '%s',
    (_name, req) => {
      const theme = tokens.themes[mode];
      const ratio = contrastRatio(resolveToken(theme, req.fg), resolveToken(theme, req.bg));
      expect(ratio, req.use).toBeGreaterThanOrEqual(req.min);
    },
  );
});

describe.each(modes)('chart palette in %s mode', (mode) => {
  const { categorical, surface, sequential } = tokens.themes[mode].chart;

  it('passes the categorical checks on adjacent pairs (bars, stacks, lines)', () => {
    const report = validateCategorical(categorical, { mode, surface });
    expect(report.offBand).toEqual([]);
    expect(report.lowChroma).toEqual([]);
    expect(report.lowContrast).toEqual([]);
    expect(report.worstCvd.value).toBeGreaterThanOrEqual(CHART_RULES.cvdTarget);
    expect(report.worstNormal.value).toBeGreaterThanOrEqual(CHART_RULES.normalFloor);
  });

  it('keeps its first three series distinct all-against-all (scatter, maps)', () => {
    const report = validateCategorical(categorical.slice(0, 3), { mode, surface, pairs: 'all' });
    expect(report.ok).toBe(true);
    expect(report.worstCvd.value).toBeGreaterThanOrEqual(CHART_RULES.cvdTarget);
  });

  it('has 8 series', () => {
    expect(categorical).toHaveLength(8);
  });

  it('has a sequential ramp whose lightness moves one way', () => {
    const ls = sequential.map((hex) => hexToOklch(hex).l);
    const deltas = ls.slice(1).map((l, i) => l - (ls[i] ?? 0));
    const direction = Math.sign(deltas[0] ?? 0);
    expect(direction).not.toBe(0);
    for (const d of deltas) expect(Math.sign(d)).toBe(direction);
  });
});

describe('generated CSS', () => {
  it('is in sync with tokens.json (run npm run brand:tokens after changing the recipe)', () => {
    const css = readFileSync(
      new URL('../../../../apps/web/src/styles/tokens.css', import.meta.url),
      'utf8',
    );
    expect(css).toBe(tokensToCss(tokens));
  });
});
