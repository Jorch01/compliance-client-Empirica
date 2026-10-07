import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.ts';
import { AuthError } from '../auth/types.ts';
import { Button } from '../ui/Button.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { TextField } from '../ui/Field.tsx';

/**
 * For someone who signs in with Google: a password for the same account, so
 * the email works too. In the app installed on an iPhone, Google's window
 * may never come back (F7); the password always does.
 */
export function PasswordDialog({
  open,
  email,
  onClose,
  onDone,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t('auth.errors.weak-password'));
      return;
    }
    setBusy(true);
    try {
      await client.addPassword(password);
      setDone(true);
      setPassword('');
      onDone();
    } catch (e) {
      setError(t(`auth.errors.${e instanceof AuthError ? e.code : 'unknown'}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('account.createPassword')}
      size="sm"
      footer={
        done ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="crear-contrasena"
              icon="lock"
              busy={busy}
              busyLabel={t('account.passwordSaving')}
            >
              {t('account.passwordSave')}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p role="status">{t('account.passwordDone', { email })}</p>
      ) : (
        <form id="crear-contrasena" className="space-y-4" onSubmit={(e) => void save(e)} noValidate>
          <p className="text-sm text-muted-foreground">{t('account.passwordIntro', { email })}</p>
          <TextField
            label={t('auth.newPassword')}
            type="password"
            autoComplete="new-password"
            required
            hint={t('auth.passwordHint')}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
          {error ? (
            <p
              role="alert"
              className="rounded-control border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
            >
              {error}
            </p>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
