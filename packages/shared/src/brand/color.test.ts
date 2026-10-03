import { describe, expect, it } from 'vitest';
import {
  adobeRgbToSrgb,
  contrastRatio,
  hexToOklch,
  labD50ToSrgb,
  maxChroma,
  oklchToHex,
  parseHex,
  toHex,
} from './color.ts';

describe('WCAG contrast', () => {
  it('matches the reference extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('matches a well-known mid gray', () => {
    // #767676 is the lightest gray that reaches 4.5:1 on white.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#002e29', '#fbefe7')).toBeCloseTo(
      contrastRatio('#fbefe7', '#002e29'),
      10,
    );
  });
});

describe('OKLCH round trip', () => {
  it.each(['#002e29', '#e5a386', '#f4b79f', '#fbefe7', '#000000', '#ffffff', '#3f4b9f'])(
    '%s survives hex -> OKLCH -> hex',
    (hex) => {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    },
  );

  it('maps white to L = 1 with no chroma', () => {
    const white = hexToOklch('#ffffff');
    expect(white.l).toBeCloseTo(1, 4);
    expect(white.c).toBeLessThan(1e-4);
  });

  it('reduces chroma instead of clipping channels when out of gamut', () => {
    const requested = { l: 0.6, c: 0.4, h: 183.6 };
    const result = hexToOklch(oklchToHex(requested));
    expect(result.c).toBeLessThanOrEqual(maxChroma(0.6, 183.6) + 0.005);
    expect(Math.abs(result.h - requested.h)).toBeLessThan(2);
  });
});

describe('Adobe RGB (1998) -> sRGB', () => {
  it('keeps white and black', () => {
    expect(toHex(adobeRgbToSrgb(parseHex('#ffffff')).rgb)).toBe('#ffffff');
    expect(toHex(adobeRgbToSrgb(parseHex('#000000')).rgb)).toBe('#000000');
  });

  it('keeps neutral grays (same white point, near-identical tone curves)', () => {
    const gray = adobeRgbToSrgb(parseHex('#808080')).rgb;
    expect(Math.abs(gray.r - gray.g)).toBeLessThan(1 / 255);
    expect(Math.round(gray.r * 255)).toBeGreaterThanOrEqual(127);
    expect(Math.round(gray.r * 255)).toBeLessThanOrEqual(129);
  });

  it('flags colors outside the sRGB gamut', () => {
    expect(adobeRgbToSrgb(parseHex('#00ff00')).clipped).toBe(true);
    // The letterhead's logo green, as stored (13, 50, 45), is just outside sRGB.
    const logo = adobeRgbToSrgb({ r: 13 / 255, g: 50 / 255, b: 45 / 255 });
    expect(logo.clipped).toBe(true);
    expect(toHex(logo.rgb)).toBe('#002e29');
  });
});

describe('CIE Lab (D50) -> sRGB', () => {
  it('maps the D50 white and black to sRGB white and black', () => {
    expect(toHex(labD50ToSrgb([100, 0, 0]).rgb)).toBe('#ffffff');
    expect(toHex(labD50ToSrgb([0, 0, 0]).rgb)).toBe('#000000');
  });

  it('reproduces the brand Pantones from their Lab values in the vector master', () => {
    expect(toHex(labD50ToSrgb([18.0392, -14, 0]).rgb)).toBe('#11322c'); // PANTONE 627 C
    expect(toHex(labD50ToSrgb([71.3726, 17, 23]).rgb)).toBe('#d7a386'); // PANTONE 7514 C
  });
});
