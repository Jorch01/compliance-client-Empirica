/** A share done (0 to 100) as a bar, with the words that carry its meaning beside it. */
export function ProgressBar({ value, text }: { value: number; text: string }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-2 w-24 shrink-0 overflow-hidden rounded-full border border-border bg-muted"
      >
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${String(width)}%` }}
        />
      </span>
      <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">{text}</span>
    </span>
  );
}
