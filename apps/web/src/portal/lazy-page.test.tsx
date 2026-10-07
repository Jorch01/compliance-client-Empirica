/**
 * Each screen downloads when it first opens (F7). If its code does not
 * arrive, the frame stays and the screen says to reload, not "report an error".
 */
import { render, screen } from '@testing-library/react';
import { Suspense, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { FeedbackContext } from '../feedback/context.ts';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { CrashScreen } from './CrashScreen.tsx';
import { lazyPage } from './lazy-page.ts';

function Frame({ children }: { children: ReactNode }) {
  const { hook } = memoryLocation({ path: '/' });
  return (
    <Router hook={hook}>
      <FeedbackContext value={{ open: vi.fn() }}>
        <nav>menu</nav>
        <ErrorBoundary fallback={(error, reset) => <CrashScreen error={error} reset={reset} />}>
          <Suspense fallback={<p>cargando</p>}>{children}</Suspense>
        </ErrorBoundary>
      </FeedbackContext>
    </Router>
  );
}

describe('screens that load when they open', () => {
  beforeEach(() => {
    // React reports every caught error on the console.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws the screen once its code arrives', async () => {
    const Page = lazyPage(() => Promise.resolve({ HelpPage: () => <h1>Ayuda</h1> }), 'HelpPage');
    render(
      <Frame>
        <Page />
      </Frame>,
    );
    expect(await screen.findByRole('heading', { name: 'Ayuda' })).toBeInTheDocument();
  });

  it('once its code is here, a screen draws at once, without "loading"', async () => {
    const Page = lazyPage(() => Promise.resolve({ HelpPage: () => <h1>Ayuda</h1> }), 'HelpPage');
    await Page.preload();
    render(
      <Frame>
        <Page />
      </Frame>,
    );
    expect(screen.getByRole('heading', { name: 'Ayuda' })).toBeInTheDocument();
    expect(screen.queryByText('cargando')).toBeNull();
  });

  it('asks to reload when the code does not arrive, keeping the frame', async () => {
    const Page = lazyPage(
      () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
      'HelpPage',
    );
    render(
      <Frame>
        <Page />
      </Frame>,
    );
    expect(
      await screen.findByRole('heading', { name: 'No se pudo abrir esta pantalla' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Avisar del error' })).toBeNull();
    expect(screen.getByText('menu')).toBeInTheDocument();
  });

  it('a preload that failed lets the screen try again when it opens', async () => {
    let attempts = 0;
    const Page = lazyPage(() => {
      attempts++;
      return attempts === 1
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve({ HelpPage: () => <h1>Ayuda</h1> });
    }, 'HelpPage');
    await expect(Page.preload()).rejects.toThrow('No se pudo descargar');
    render(
      <Frame>
        <Page />
      </Frame>,
    );
    expect(await screen.findByRole('heading', { name: 'Ayuda' })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});
