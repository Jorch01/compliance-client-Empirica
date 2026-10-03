import { Icon, type IconName } from './Icon.tsx';

/** The traffic light (DISENO.md § 5): always icon and text, never color alone. */
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STYLE: Record<Tone, { icon: IconName; className: string; iconClass: string }> = {
  success: {
    icon: 'checkCircle',
    className: 'border-success-border bg-success-subtle text-success-subtle-foreground',
    iconClass: 'text-success',
  },
  warning: {
    icon: 'clock',
    className: 'border-warning-border bg-warning-subtle text-warning-subtle-foreground',
    iconClass: 'text-warning',
  },
  danger: {
    icon: 'alert',
    className: 'border-danger-border bg-danger-subtle text-danger-subtle-foreground',
    iconClass: 'text-danger',
  },
  info: {
    icon: 'info',
    className: 'border-info-border bg-info-subtle text-info-subtle-foreground',
    iconClass: 'text-info',
  },
  neutral: {
    icon: 'minus',
    className: 'border-neutral-border bg-neutral-subtle text-neutral-subtle-foreground',
    iconClass: 'text-neutral',
  },
};

export function StatusBadge({ tone, children }: { tone: Tone; children: string }) {
  const s = STYLE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium whitespace-nowrap ${s.className}`}
    >
      <Icon name={s.icon} className={`size-4 ${s.iconClass}`} />
      {children}
    </span>
  );
}
