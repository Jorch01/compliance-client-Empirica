import { Button } from './Button.tsx';

/** A row of toggle buttons that narrow a list; the chosen one is pressed. */
export function FilterButtons<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Button
          key={o.value}
          size="sm"
          variant={value === o.value ? 'primary' : 'secondary'}
          aria-pressed={value === o.value}
          onClick={() => {
            onChange(o.value);
          }}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
