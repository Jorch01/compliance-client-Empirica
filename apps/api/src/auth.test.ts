/**
 * Every request is authenticated: a valid Firebase token, a verified email,
 * and a whitelisted, active user. Anything else gets a clear error and no
 * data at all.
 */
import { ERROR_MESSAGES, type ApiFailure } from '@empirica/shared';
import { ID } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { PROP } from './env.ts';
import { MAX_BODY_CHARS, handleRequest } from './router.ts';
import { createWorld } from './testing/harness.ts';

const failure = (res: unknown): ApiFailure['error'] => {
  const r = res as ApiFailure;
  expect(r.ok).toBe(false);
  return r.error;
};

describe('the envelope', () => {
  const w = createWorld();

  it('always carries the server clock with the project offset, and the request id', () => {
    const res = w.call('ping');
    expect(res).toMatchObject({ ok: true, data: { pong: true }, requestId: 'req-1' });
    expect(res.serverNow).toBe('2026-10-02T12:00:00.000-05:00');
  });

  it('rejects what is not JSON, another contract version, huge bodies and unknown actions', () => {
    expect(failure(handleRequest(w.env, 'no es json')).code).toBe('VALIDATION');
    expect(failure(handleRequest(w.env, JSON.stringify({ v: 2, action: 'ping' }))).code).toBe(
      'VALIDATION',
    );
    expect(failure(handleRequest(w.env, 'x'.repeat(MAX_BODY_CHARS + 1))).code).toBe('VALIDATION');
    expect(failure(w.call('admin.deleteEverything', {}, { as: ID.socio })).code).toBe(
      'NOT_IMPLEMENTED',
    );
  });

  it('rejects payloads that do not match the contract', () => {
    expect(failure(w.call('sync.pull', { cursor: -1 }, { as: ID.socio })).code).toBe('VALIDATION');
    expect(failure(w.call('sync.push', { ops: 'x' }, { as: ID.socio })).code).toBe('VALIDATION');
  });

  it('asks an outdated app to update', () => {
    w.edit('Config', w.rows('Config').find((c) => c.clave === 'minAppVersion')?.id ?? '', {
      valor: '1.2.0',
    });
    expect(
      failure(w.call('sync.pull', { cursor: 0 }, { as: ID.socio, appVersion: '1.1.9' })),
    ).toMatchObject({
      code: 'CLIENT_TOO_OLD',
      details: { minAppVersion: '1.2.0' },
    });
    expect(w.call('sync.pull', { cursor: 0 }, { as: ID.socio, appVersion: '1.2.0' }).ok).toBe(true);
  });
});

describe('who may call', () => {
  it('requires a token', () => {
    const w = createWorld();
    expect(failure(w.call('sync.pull', { cursor: 0 }))).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: ERROR_MESSAGES.UNAUTHENTICATED,
    });
  });

  it('refuses a malformed token, one of another project and an expired one without asking Firebase', () => {
    const w = createWorld();
    const otherProject = w.google.firebase.issue({
      uid: 'x',
      email: 'socia@despacho.example',
      projectId: 'otro-proyecto',
    });
    const expired = w.google.firebase.issue({
      uid: 'x',
      email: 'socia@despacho.example',
      expiresIn: -3600,
    });
    for (const token of ['abc', 'a.b.c', otherProject, expired]) {
      expect(failure(w.call('sync.pull', { cursor: 0 }, { token })).code).toBe('UNAUTHENTICATED');
    }
    expect(w.google.firebase.lookups).toBe(0);
  });

  it('refuses a token Firebase did not issue', () => {
    const w = createWorld();
    const real = w.google.firebase.issue({ uid: 'x', email: 'socia@despacho.example' });
    const [h, p] = real.split('.');
    expect(
      failure(w.call('sync.pull', { cursor: 0 }, { token: `${h ?? ''}.${p ?? ''}.firma-falsa` }))
        .code,
    ).toBe('UNAUTHENTICATED');
  });

  it('requires a verified email', () => {
    const w = createWorld();
    const token = w.google.firebase.issue({
      uid: 'x',
      email: 'socia@despacho.example',
      emailVerified: false,
    });
    expect(failure(w.call('sync.pull', { cursor: 0 }, { token })).code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('a Firebase account alone gives no access: "Solicita acceso a tu abogado de Empírica"', () => {
    const w = createWorld();
    const token = w.google.firebase.issue({ uid: 'x', email: 'desconocido@ejemplo.example' });
    expect(failure(w.call('session.bootstrap', {}, { token }))).toMatchObject({
      code: 'NOT_WHITELISTED',
      message: 'Solicita acceso a tu abogado de Empírica.',
    });
  });

  it('a deactivated user loses access at once', () => {
    const w = createWorld();
    const token = w.google.firebase.issue({ uid: 'x', email: 'baja@cliente-a.example' });
    expect(failure(w.call('sync.pull', { cursor: 0 }, { token })).code).toBe('NOT_WHITELISTED');
  });

  it('matches the email without regard to case', () => {
    const w = createWorld();
    const token = w.google.firebase.issue({ uid: 'x', email: 'Socia@Despacho.EXAMPLE' });
    expect(w.call('sync.pull', { cursor: 0 }, { token }).ok).toBe(true);
  });

  it('ties the user to the first Firebase account that signs in, and refuses another one', () => {
    const w = createWorld();
    const first = w.google.firebase.issue({ uid: 'cuenta-1', email: 'abogado@despacho.example' });
    expect(w.call('session.bootstrap', {}, { token: first }).ok).toBe(true);
    expect(w.row('Usuarios', ID.abogado)?.firebaseUid).toBe('cuenta-1');
    const second = w.google.firebase.issue({ uid: 'cuenta-2', email: 'abogado@despacho.example' });
    expect(failure(w.call('sync.pull', { cursor: 0 }, { token: second }))).toMatchObject({
      code: 'UNAUTHENTICATED',
      details: { reason: 'ACCOUNT_CHANGED' },
    });
  });

  it('caches a verified token for a few minutes, by its hash', () => {
    const w = createWorld();
    w.call('sync.pull', { cursor: 0 }, { as: ID.socio });
    w.call('sync.pull', { cursor: 0 }, { as: ID.socio });
    expect(w.google.firebase.lookups).toBe(1);
    const token = w.tokenFor(ID.socio);
    expect([...w.google.cache.keys()].some((k) => k.includes(token))).toBe(false);
    w.clock.advance(6 * 60_000);
    w.call('sync.pull', { cursor: 0 }, { as: ID.socio });
    expect(w.google.firebase.lookups).toBe(2);
  });

  it('says so when the server is not configured, without leaking anything else', () => {
    const w = createWorld();
    w.google.props.delete(PROP.firebaseApiKey);
    expect(failure(w.call('sync.pull', { cursor: 0 }, { as: ID.socio }))).toMatchObject({
      code: 'INTERNAL',
      message: expect.stringContaining('FIREBASE_SERVER_API_KEY') as unknown,
    });
  });

  it('does not blame the user when Identity Toolkit fails', () => {
    const w = createWorld();
    w.google.firebase.failWith = 503;
    expect(failure(w.call('sync.pull', { cursor: 0 }, { as: ID.socio })).code).toBe('INTERNAL');
  });

  it('limits the requests per user and minute', () => {
    const w = createWorld();
    w.edit(
      'Config',
      w.rows('Config').find((c) => c.clave === 'limiteSolicitudesPorMinuto')?.id ?? '',
      {
        valor: '3',
      },
    );
    const codes = Array.from({ length: 5 }, () => {
      const res = w.call('sync.pull', { cursor: 0 }, { as: ID.cB });
      return res.ok ? 'ok' : res.error.code;
    });
    expect(codes).toEqual(['ok', 'ok', 'ok', 'RATE_LIMITED', 'RATE_LIMITED']);
    w.clock.advance(60_000);
    expect(w.call('sync.pull', { cursor: 0 }, { as: ID.cB }).ok).toBe(true);
  });
});
