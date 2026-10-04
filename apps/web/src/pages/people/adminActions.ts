import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Action } from '@empirica/shared';
import { apiErrorText } from '../../i18n/errors.ts';
import { usePortal } from '../../session/context.ts';

/**
 * An online administration call (users, memberships): busy while it runs,
 * the error in words if it fails, and a sync afterwards so every screen
 * shows the change.
 */
export function useAdminCall(): {
  run: (action: Action, payload: unknown) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  clear: () => void;
} {
  const { t } = useTranslation();
  const { call, engine } = usePortal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (action: Action, payload: unknown): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await call(action, payload);
        await engine.sync();
        return true;
      } catch (e) {
        setError(apiErrorText(t, e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [call, engine, t],
  );
  const clear = useCallback(() => {
    setError(null);
  }, []);
  return { run, busy, error, clear };
}
