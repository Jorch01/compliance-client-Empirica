import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button.tsx';
import { Dialog } from './Dialog.tsx';

/** "Are you sure?" for changes that affect someone's access. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {children}
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger-subtle-foreground">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
