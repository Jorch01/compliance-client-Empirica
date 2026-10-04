import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.ts';
import { listDemoUsers, type DemoUser } from '../auth/mock.ts';
import { roleLabel } from '../i18n/labels.ts';
import { Button } from '../ui/Button.tsx';
import { TextField } from '../ui/Field.tsx';

/** Demo sign-in (npm run dev:mock): the fictitious users, or any e-mail for invitations. */
export function MockSignIn() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    void listDemoUsers().then(setUsers);
  }, []);
  const enter = async (address: string): Promise<void> => {
    setBusy(address);
    try {
      await client.signInWithPassword(address, 'demo');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="rounded-card border border-border bg-card p-6 text-card-foreground shadow-card">
      <p className="label-caps text-muted-foreground">{t('auth.mock.title')}</p>
      <h1 className="mt-1 text-3xl font-semibold">{t('auth.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('auth.mock.subtitle')}</p>
      <ul className="mt-4 divide-y divide-border rounded-control border border-border">
        {users.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted"
              onClick={() => void enter(u.email)}
              disabled={busy !== null}
            >
              <span>
                <span className="block font-medium">{u.nombre}</span>
                <span className="block text-sm text-muted-foreground">{u.email}</span>
              </span>
              <span className="text-sm text-muted-foreground">{roleLabel(t, u.rolBase)}</span>
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void enter(email);
        }}
      >
        <TextField
          label={t('auth.mock.other')}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <Button type="submit" variant="secondary" busy={busy === email && email !== ''}>
          {t('auth.mock.enter')}
        </Button>
      </form>
    </div>
  );
}
