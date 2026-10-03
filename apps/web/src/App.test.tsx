import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';

describe('App (public placeholder until phase 2)', () => {
  it('shows the brand and a message for clients, nothing about internal progress', () => {
    render(<App />);
    expect(screen.getByRole('img', { name: 'Empírica Legal Lab' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Muy pronto' })).toBeInTheDocument();
    expect(screen.getByText(/acceso es por invitación/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/fase|plan|paleta/i);
  });
});
