/** The look of a button, for links that act as buttons too. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border border-border bg-card text-card-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  danger: 'bg-danger text-danger-foreground hover:opacity-90',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: 'sm' | 'md' = 'md'): string {
  return [
    'inline-flex items-center justify-center gap-2 rounded-control font-medium transition',
    'disabled:cursor-not-allowed disabled:opacity-60',
    size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4',
    VARIANTS[variant],
  ].join(' ');
}
