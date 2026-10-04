/** Initials of a name ("Socia Demo" → "SD"): first and last word. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/** A person's initials in a circle; decorative, the name is always next to it. */
export function Avatar({ name, tone = 'primary' }: { name: string; tone?: 'primary' | 'accent' }) {
  const colors =
    tone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground';
  return (
    <span
      aria-hidden="true"
      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${colors}`}
    >
      {initials(name)}
    </span>
  );
}
