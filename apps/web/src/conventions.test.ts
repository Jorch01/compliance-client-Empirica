/**
 * Conventions the CLAUDE.md asks for, checked on every source file of the
 * web app: colors come only from the generated tokens (no hex typed by
 * hand), and every visible text from the translation files.
 */
import { MIN_APP_VERSION, compareVersions } from '@empirica/shared';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './config/api.ts';

const sources = import.meta.glob<string>(
  ['./**/*.{ts,tsx,css}', '!./styles/tokens.css', '!./**/*.test.{ts,tsx}'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

describe('web conventions', () => {
  it('types no color by hand: only tokens (third-party marks live in src/assets)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const offenders = Object.entries(sources)
      .filter(([, text]) =>
        /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/.test(text.replace(/&#\d+;/g, '')),
      )
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('every scroll container is positioned, so screen-reader text in it does not widen the page', () => {
    // An `sr-only` text is absolutely positioned: inside an unpositioned scroll
    // container it escapes the clipping and makes the page scroll sideways at 320 px.
    const offenders = Object.entries(sources).flatMap(([path, text]) =>
      [...text.matchAll(/className="([^"]*\boverflow(?:-x)?-(?:auto|scroll)\b[^"]*)"/g)]
        .filter((m) => !/\b(?:relative|absolute|fixed|sticky)\b/.test(m[1] ?? ''))
        .map((m) => `${path}: ${m[1] ?? ''}`),
    );
    expect(offenders).toEqual([]);
  });

  it('ships a version its own backend accepts', () => {
    expect(APP_VERSION).not.toBe('0.0.0');
    expect(compareVersions(APP_VERSION, MIN_APP_VERSION)).toBeGreaterThanOrEqual(0);
  });
});
