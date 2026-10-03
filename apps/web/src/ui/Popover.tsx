import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface PopoverTrigger {
  'aria-expanded': boolean;
  'aria-controls': string;
  onClick: () => void;
}

/**
 * A button that shows a panel below it (disclosure pattern): Esc or a click
 * outside closes it and focus goes back to the button.
 */
export function Popover({
  trigger,
  children,
  align = 'end',
  className = 'w-80',
}: {
  trigger: (props: PopoverTrigger) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const button = (): HTMLElement | null =>
      root.current?.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(id)}"]`) ?? null;
    const onPointer = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button()?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, id]);

  return (
    <div ref={root} className="relative">
      {trigger({
        'aria-expanded': open,
        'aria-controls': id,
        onClick: () => {
          setOpen((o) => !o);
        },
      })}
      {open ? (
        <div
          id={id}
          className={`absolute top-full z-30 mt-2 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-popover p-4 text-popover-foreground shadow-raised ${align === 'end' ? 'right-0' : 'left-0'} ${className}`}
        >
          {children(() => {
            setOpen(false);
          })}
        </div>
      ) : null}
    </div>
  );
}
