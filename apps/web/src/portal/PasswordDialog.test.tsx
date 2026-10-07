/**
 * Someone who signs in with Google adds a password to the same account
 * (F7): the way into the app installed on an iPhone when Google's window
 * does not come back.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import { AuthError } from '../auth/types.ts';
import { fakeAuth } from '../test/fakeAuth.ts';
import { PasswordDialog } from './PasswordDialog.tsx';

function renderDialog(addPassword: (password: string) => Promise<void>) {
  const onDone = vi.fn();
  render(
    <AuthProvider client={{ ...fakeAuth(null), addPassword }}>
      <PasswordDialog open email="persona@cliente.example" onClose={vi.fn()} onDone={onDone} />
    </AuthProvider>,
  );
  const type = (value: string) => {
    fireEvent.change(screen.getByLabelText('Crea una contraseña'), { target: { value } });
  };
  const save = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Crear contraseña' }));
      await Promise.resolve();
    });
  };
  return { onDone, type, save };
}

describe('a password for a Google account', () => {
  it('asks for 8 characters, then adds it and says how to sign in now', async () => {
    const addPassword = vi.fn(() => Promise.resolve());
    const dialog = renderDialog(addPassword);
    expect(
      screen.getByText(/también podrás entrar con persona@cliente\.example/),
    ).toBeInTheDocument();
    dialog.type('corta');
    await dialog.save();
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 8 caracteres');
    expect(addPassword).not.toHaveBeenCalled();

    dialog.type('una-contraseña-larga');
    await dialog.save();
    expect(addPassword).toHaveBeenCalledWith('una-contraseña-larga');
    expect(dialog.onDone).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent(
      'también puedes entrar con persona@cliente.example y esta contraseña',
    );
  });

  it('when Google wants a recent sign-in, it says what to do', async () => {
    const dialog = renderDialog(() => Promise.reject(new AuthError('recent-login')));
    dialog.type('una-contraseña-larga');
    await dialog.save();
    expect(screen.getByRole('alert')).toHaveTextContent('vuelve a entrar con Google');
    expect(dialog.onDone).not.toHaveBeenCalled();
  });
});
