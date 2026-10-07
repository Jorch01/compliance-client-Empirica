import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon.tsx';

/** Back to the button that opened a dialog, unless the focus already went somewhere. */
function returnFocus(opener: HTMLElement | null): void {
  const lost = !document.activeElement || document.activeElement === document.body;
  if (lost && opener?.isConnected) opener.focus();
}

/**
 * A modal dialog on the native <dialog>: focus moves in and comes back,
 * Esc closes it, the page behind is inert. Accessible by default.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  error,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Shown above the buttons, where the person is looking when it fails. */
  error?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const { t } = useTranslation();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      // Back to the button that opened it, where a browser does not do it itself.
      returnFocus(opener.current);
    }
  }, [open]);

  // Removed while open (the form that held it went away): the same.
  useEffect(
    () => () => {
      returnFocus(opener.current);
    },
    [],
  );

  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-panel border border-border bg-popover p-0 text-popover-foreground shadow-raised backdrop:bg-foreground/40`}
    >
      {open ? (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <h2 id={titleId} className="text-xl font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="-m-2 rounded-control p-2 text-muted-foreground hover:bg-muted"
            >
              <Icon name="x" label={t('common.close')} />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="border-t border-border px-5 py-3">
              {error ? (
                <p
                  role="alert"
                  className="mb-3 rounded-control border border-danger-border bg-danger-subtle px-3 py-2 text-sm font-medium text-danger-subtle-foreground"
                >
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">{footer}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
