import type { ReactNode } from 'react';
import { Link } from 'wouter';
import type { Tone } from '../../ui/StatusBadge.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';

const TONES: Record<Tone, string> = {
  danger: 'border-danger-border bg-danger-subtle text-danger-subtle-foreground',
  warning: 'border-warning-border bg-warning-subtle text-warning-subtle-foreground',
  info: 'border-info-border bg-info-subtle text-info-subtle-foreground',
  success: 'border-success-border bg-success-subtle text-success-subtle-foreground',
  neutral: 'border-border bg-card text-card-foreground',
};
const ICON_TONES: Record<Tone, string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
  success: 'text-success',
  neutral: 'text-muted-foreground',
};

/**
 * A number to act on: a count with its icon and its words. Colored only when
 * there is something to see; at zero it rests in neutral.
 */
export function Tile({
  tone,
  icon,
  label,
  count,
  onClick,
  href,
  hint,
  'data-tour': tour,
}: {
  tone: Tone;
  icon: IconName;
  label: string;
  count: number;
  onClick?: () => void;
  href?: string;
  hint?: ReactNode;
  'data-tour'?: string;
}) {
  const active = count > 0 ? tone : 'neutral';
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <Icon name={icon} className={`size-6 ${ICON_TONES[active]}`} />
        <Icon name="chevronRight" className="size-4 opacity-60" />
      </span>
      <span className="mt-3 block text-4xl font-semibold tabular-nums">{count}</span>
      <span className="mt-1 block text-sm font-medium">{label}</span>
      {hint ? <span className="mt-1 block text-xs opacity-80">{hint}</span> : null}
    </>
  );
  const className = `block w-full rounded-card border p-4 text-left shadow-subtle transition hover:shadow-card ${TONES[active]}`;
  if (href) {
    return (
      <Link href={href} className={className} data-tour={tour}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} data-tour={tour}>
      {body}
    </button>
  );
}
