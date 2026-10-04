import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import type { AuthUser } from '../auth/types.ts';
import { fakeAuth } from '../test/fakeAuth.ts';

vi.mock('../config/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config/api.ts')>()),
  API_URL: 'https://api.example/exec',
}));

const USER: AuthUser = {
  uid: 'u-invitada',
  email: 'persona@cliente.example',
  emailVerified: true,
  name: 'Persona Demo',
  providers: ['google.com'],
};
const LINK = `#/invitacion/${'ab'.repeat(32)}`;
const NOW = '2026-10-04T12:00:00-05:00';

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const ACCEPTED = (): Response => json({ ok: true, data: { clienteId: 'c1' }, serverNow: NOW });

/** What the server answers to each acceptance, in order. */
let answers: (() => Response | Promise<Response>)[] = [];
const actionOf = (init?: RequestInit): string =>
  typeof init?.body === 'string' ? (JSON.parse(init.body) as { action: string }).action : '';
const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
  const action = actionOf(init);
  // The session asks who this is: not a portal user until the invitation is accepted.
  if (action === 'session.bootstrap') {
    return Promise.resolve(
      json({
        ok: false,
        error: { code: 'NOT_WHITELISTED', message: '', details: { reason: 'INVITADO' } },
        serverNow: NOW,
      }),
    );
  }
  const next = answers.shift();
  if (action !== 'invitations.accept' || !next) throw new Error(`unexpected ${action}`);
  return Promise.resolve(next());
});
const acceptances = (): number =>
  fetchMock.mock.calls.filter(([, init]) => actionOf(init) === 'invitations.accept').length;

describe('AcceptInvitation', () => {
  beforeEach(() => {
    window.location.hash = LINK;
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    answers = [];
    window.location.hash = '';
    vi.unstubAllGlobals();
  });

  it('tries again when the person signs in again, instead of showing the old error', async () => {
    answers = [() => Promise.reject(new TypeError('Failed to fetch')), ACCEPTED];
    const auth = fakeAuth(USER, () => 'id-token');
    render(<App authClient={auth} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos comunicarnos con el servidor del portal.',
    );
    expect(screen.getByText('NetworkError: Failed to fetch')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Usar otra cuenta' }));
    expect(await screen.findByText(/Para aceptarla, entra o crea tu cuenta/)).toBeInTheDocument();
    act(() => {
      auth.emit(USER);
    });
    expect(
      await screen.findByRole('heading', { name: '¡Listo! Ya tienes acceso.' }),
    ).toBeInTheDocument();
    expect(acceptances()).toBe(2);
  });

  it('names a page that is not the portal’s answer, and "Reintentar" runs it again', async () => {
    answers = [
      () =>
        new Response(
          '<html><head><title>Error</title><style>body{margin:0}</style></head>' +
            '<body><div>Authorization is required to perform that action.</div></body></html>',
          { headers: { 'Content-Type': 'text/html' } },
        ),
      ACCEPTED,
    ];
    render(<App authClient={fakeAuth(USER, () => 'id-token')} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos comunicarnos con el servidor del portal.',
    );
    expect(
      screen.getByText(
        'NetworkError: Respuesta inesperada del servidor (200): Error Authorization is required to perform that action.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { name: '¡Listo! Ya tienes acceso.' }),
    ).toBeInTheDocument();
    expect(acceptances()).toBe(2);
  });

  it('has nothing to retry when the invitation is for someone else', async () => {
    answers = [
      () =>
        json({
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Esta invitación es para o***@cliente.example. Entra con esa cuenta.',
            details: { reason: 'EMAIL_MISMATCH', email: 'o***@cliente.example' },
          },
          serverNow: NOW,
        }),
    ];
    render(<App authClient={fakeAuth(USER, () => 'id-token')} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta invitación es para o***@cliente.example. Cierra sesión y entra con esa cuenta.',
    );
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    expect(screen.queryByText('Detalle técnico')).toBeNull();
  });

  it('tells a session Firebase cannot hand out apart from the server', async () => {
    const auth = fakeAuth(USER, () => {
      throw Object.assign(new Error('Firebase: Error (auth/network-request-failed).'), {
        code: 'auth/network-request-failed',
      });
    });
    render(<App authClient={auth} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo confirmar tu sesión con Google o Firebase.',
    );
    expect(
      screen.getByText(
        'auth/network-request-failed · Error: Firebase: Error (auth/network-request-failed).',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(acceptances()).toBe(0);
  });
});
