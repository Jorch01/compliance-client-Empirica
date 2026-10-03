import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import notice from './legal/aviso-de-privacidad.txt?raw';
import { PrivacyPage } from './PrivacyPage.tsx';

const squash = (text: string): string => text.replace(/\s+/g, '');

describe('privacy notice page (/privacidad/)', () => {
  it('publishes the notice word for word', () => {
    render(<PrivacyPage />);
    expect(squash(screen.getByRole('article').textContent)).toBe(squash(notice));
  });

  it('gives the notice and each of its sections a heading, and its table real headers', () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Aviso de Privacidad Integral' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(11);
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Destinatario', 'Finalidad', 'Consentimiento']);
    expect(within(table).getAllByRole('row')).toHaveLength(4);
  });

  it('links the contact address and leads back home', () => {
    render(<PrivacyPage />);
    const mail = screen.getAllByRole('link', { name: /@/ });
    expect(mail.length).toBeGreaterThan(0);
    for (const a of mail) expect(a).toHaveAttribute('href', `mailto:${a.textContent}`);
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Empírica Legal Lab' })).toHaveAttribute('href', '/');
  });
});
