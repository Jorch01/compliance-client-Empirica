import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FeedbackContext, type FeedbackContextValue, type FeedbackKind } from './context.ts';
import { recordError } from './diagnostics.ts';
import { FeedbackDialog } from './FeedbackDialog.tsx';

/** One feedback form for the whole portal, opened from the menu, Help or a crash. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ tipo: FeedbackKind; error: unknown } | null>(null);
  const openForm = useCallback<FeedbackContextValue['open']>((options) => {
    if (options?.error !== undefined) recordError(options.error, 'pantalla');
    setOpen({
      tipo: options?.tipo ?? (options?.error !== undefined ? 'ERROR' : 'SUGERENCIA'),
      error: options?.error,
    });
  }, []);
  const value = useMemo<FeedbackContextValue>(() => ({ open: openForm }), [openForm]);
  return (
    <FeedbackContext value={value}>
      {children}
      {open ? (
        <FeedbackDialog
          initialKind={open.tipo}
          crash={open.error}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </FeedbackContext>
  );
}
