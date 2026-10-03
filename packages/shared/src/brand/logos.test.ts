import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { labD50ToSrgb, toHex } from './color.ts';
import { logos, tokens } from './index.ts';

const spotFile = JSON.parse(
  readFileSync(new URL('../../../../brand/spot-colors.json', import.meta.url), 'utf8'),
) as {
  dark: string;
  light: string;
  spots: { name: string; lab: [number, number, number]; hex: string }[];
};

describe('spot colors from the vector master', () => {
  it.each(spotFile.spots.map((s) => [s.name, s] as const))(
    '%s converts as recorded',
    (_n, spot) => {
      expect(toHex(labD50ToSrgb(spot.lab).rgb)).toBe(spot.hex);
    },
  );

  it('anchor the brand green and peach', () => {
    const hex = (name: string): string | undefined =>
      spotFile.spots.find((s) => s.name === name)?.hex;
    expect(tokens.brand.green).toBe(hex(spotFile.dark));
    expect(tokens.brand.peach).toBe(hex(spotFile.light));
  });
});

describe('logos', () => {
  it.each(Object.entries(logos))('%s is pure outlines with a valid viewBox', (_name, logo) => {
    const box = logo.viewBox.split(' ').map(Number);
    expect(box).toHaveLength(4);
    expect(box.every((n) => Number.isFinite(n))).toBe(true);
    expect(logo.paths.length).toBeGreaterThan(0);
    for (const d of logo.paths) expect(d).toMatch(/^M [\d.\s\-MLCZ]+$/);
  });
});
