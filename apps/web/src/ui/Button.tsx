import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { buttonClass, type ButtonVariant } from './button-class.ts';
import { Icon, type IconName } from './Icon.tsx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: IconName;
  /** Shows a spinner and blocks clicks; the label stays (screen readers hear `busyLabel`). */
  busy?: boolean;
  busyLabel?: string;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  busy = false,
  busyLabel,
  className = '',
  children,
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonClass(variant, size)} ${className}`}
      disabled={disabled === true || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? (
        <Icon name="refresh" className="size-4 animate-spin" />
      ) : icon ? (
        <Icon name={icon} className="size-4" />
      ) : null}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
