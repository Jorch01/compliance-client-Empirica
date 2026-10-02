import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';

describe('App (phase 0 placeholder)', () => {
  it('renders the brand and the phase status', () => {
    render(<App />);
    expect(screen.getByText('empírica')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'En construcción' })).toBeInTheDocument();
  });
});
