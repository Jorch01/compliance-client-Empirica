import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary.tsx';

let broken = true;

function Screen({ name }: { name: string }) {
  if (broken) throw new Error(`${name} failed`);
  return <p>{name} works</p>;
}

function Frame({ screenName }: { screenName: string }) {
  return (
    <>
      <nav>menu</nav>
      <ErrorBoundary
        resetKey={screenName}
        fallback={(error, reset) => (
          <div role="alert">
            {error instanceof Error ? error.message : 'unknown'}
            <button type="button" onClick={reset}>
              retry
            </button>
          </div>
        )}
      >
        <Screen name={screenName} />
      </ErrorBoundary>
    </>
  );
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    broken = true;
    // React reports every caught error on the console; the test checks it differently.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the frame when a screen throws, and tells why', () => {
    render(<Frame screenName="pendientes" />);
    expect(screen.getByText('menu')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('pendientes failed');
  });

  it('reports what it caught', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary fallback={() => <p>fallback</p>} onError={onError}>
        <Screen name="ayuda" />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toEqual(new Error('ayuda failed'));
  });

  it('starts over on the next screen', () => {
    const { rerender } = render(<Frame screenName="pendientes" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    broken = false;
    rerender(<Frame screenName="equipo" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('equipo works')).toBeInTheDocument();
  });

  it('tries the same screen again on demand', () => {
    render(<Frame screenName="solicitudes" />);
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(screen.getByText('solicitudes works')).toBeInTheDocument();
  });
});
