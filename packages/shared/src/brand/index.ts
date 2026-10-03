import logosJson from './logos.json' with { type: 'json' };
import tokensJson from './tokens.json' with { type: 'json' };
import type { BrandTokens } from './tokens.ts';

export * from './color.ts';
export * from './chart-palette.ts';
export * from './tokens.ts';

/** The approved design tokens (generated; see scripts/brand/build-tokens.ts). */
export const tokens: BrandTokens = tokensJson;

export interface LogoGeometry {
  viewBox: string;
  paths: string[];
}

/** Official logo outlines from the vector master (see scripts/brand/extract-vector.ts). */
export const logos: Record<'logo' | 'logotipo' | 'simbolo' | 'sello', LogoGeometry> = logosJson;
