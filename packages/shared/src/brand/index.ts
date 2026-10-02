import tokensJson from './tokens.json' with { type: 'json' };
import type { BrandTokens } from './tokens.ts';

export * from './color.ts';
export * from './chart-palette.ts';
export * from './tokens.ts';

/** The approved design tokens (generated; see scripts/brand/build-tokens.ts). */
export const tokens: BrandTokens = tokensJson;
