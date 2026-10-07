import { describe, expect, it } from 'vitest';
import { captureErrors, diagnostics, recordError } from './diagnostics.ts';

const sync = {
  phase: 'idle' as const,
  pending: 2,
  lastSyncAt: Date.UTC(2026, 9, 3, 12),
  error: { code: 'NETWORK', message: 'Failed to fetch' },
};

describe('diagnostics for an error report', () => {
  it('carries the app and sync state, nothing about the data', () => {
    const report = diagnostics(sync, '#/pendientes');
    expect(Object.keys(report).sort()).toEqual(
      [
        'errores',
        'idioma',
        'instalada',
        'navegador',
        'ruta',
        'sincronizacion',
        'tema',
        'ventana',
        'version',
      ].sort(),
    );
    expect(report.ruta).toBe('#/pendientes');
    expect(report.sincronizacion).toEqual({
      fase: 'idle',
      pendientes: 2,
      ultima: '2026-10-03T12:00:00.000Z',
      error: 'NETWORK',
    });
  });

  it('keeps only the last five errors, short', () => {
    for (let i = 1; i <= 7; i++) recordError(new TypeError(`fallo ${String(i)}`), '#/');
    recordError('x'.repeat(1000));
    recordError({ code: 42 });
    recordError(undefined);
    const errores = diagnostics(sync, '#/').errores as { message: string; where?: string }[];
    expect(errores.map((e) => e.message)).toEqual([
      'TypeError: fallo 6',
      'TypeError: fallo 7',
      'x'.repeat(300),
      '{"code":42}',
      'Error',
    ]);
    expect(errores[0]?.where).toBe('#/');
    expect(errores[4]).not.toHaveProperty('where');
  });

  it('notes what the security policy refused: the rule and the origin, not the address', () => {
    captureErrors();
    document.dispatchEvent(
      Object.assign(new Event('securitypolicyviolation'), {
        blockedURI: 'https://otro.example/script.js?token=secreto',
        effectiveDirective: 'script-src-elem',
        sourceFile: 'https://portal.empirica.mx/assets/main.js',
      }),
    );
    const errores = diagnostics(sync, '#/').errores as { message: string; where?: string }[];
    expect(errores.at(-1)).toMatchObject({
      message: 'CSP script-src-elem: https://otro.example',
      where: 'https://portal.empirica.mx/assets/main.js',
    });
  });
});
