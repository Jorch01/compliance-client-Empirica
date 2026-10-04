import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A side panel over the page (the menu on a phone), on the native modal
 * <dialog>: focus stays inside, Esc and a tap outside close it.
 */
export function Drawer({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // The backdrop belongs to the <dialog> itself; the panel fills the rest.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] bg-sidebar p-0 text-sidebar-foreground backdrop:bg-foreground/40"
    >
      {open ? children : null}
    </dialog>
  );
}
