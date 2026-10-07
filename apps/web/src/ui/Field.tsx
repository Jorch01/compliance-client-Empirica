import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const CONTROL =
  'w-full rounded-control border border-input bg-card px-3 py-2.5 text-foreground placeholder:text-muted-foreground aria-[invalid=true]:border-danger';

interface FieldFrame {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: string;
}

function Frame({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: FieldFrame & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> ({optional})</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          className="text-sm font-medium text-danger-subtle-foreground"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, hint: unknown, error: unknown): string | undefined =>
  [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

export function TextField({
  label,
  hint,
  error,
  optional,
  ...input
}: FieldFrame & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const id = useId();
  return (
    <Frame id={id} label={label} hint={hint} error={error} optional={optional}>
      <input
        id={id}
        className={CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
    </Frame>
  );
}

export function TextArea({
  label,
  hint,
  error,
  optional,
  ...input
}: FieldFrame & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Frame id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        id={id}
        rows={4}
        className={CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
    </Frame>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  options,
  ...select
}: FieldFrame &
  SelectHTMLAttributes<HTMLSelectElement> & {
    options: readonly { value: string; label: string }[];
  }) {
  const id = useId();
  return (
    <Frame id={id} label={label} hint={hint} error={error} optional={optional}>
      <select
        id={id}
        className={CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Frame>
  );
}

export function CheckboxField({
  label,
  hint,
  ...input
}: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-4 accent-primary"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
      <div>
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
