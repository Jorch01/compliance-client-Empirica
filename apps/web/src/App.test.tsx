import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { fakeAuth } from './test/fakeAuth.ts';

describe('App', () => {
  it('asks a signed-out visitor to sign in, by invitation only', async () => {
    render(<App authClient={fakeAuth(null)} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Inicia sesión' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar con Google/ })).toBeInTheDocument();
    expect(screen.getByText('El acceso es por invitación del despacho.')).toBeInTheDocument();
  });

  it('links the privacy notice from the sign-in screen', async () => {
    render(<App authClient={fakeAuth(null)} />);
    await screen.findByRole('heading', { level: 1, name: 'Inicia sesión' });
    const links = screen.getAllByRole('link', { name: 'Aviso de privacidad' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/privacidad/');
  });

  it('asks to confirm the email before anything else', async () => {
    const user = {
      uid: 'u1',
      email: 'persona@cliente.example',
      emailVerified: false,
      name: 'Persona',
      providers: ['password'],
    };
    render(<App authClient={fakeAuth(user)} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Confirma tu correo' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/persona@cliente\.example/)).toBeInTheDocument();
  });
});
