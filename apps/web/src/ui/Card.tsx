import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';

export function Card({
  title,
  actions,
  children,
  className = '',
  ...rest
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  'data-tour'?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-card border border-border bg-card p-5 text-card-foreground shadow-card ${className}`}
      {...rest}
    >
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-xl font-semibold">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({
  icon = 'inbox',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Icon name={icon} className="size-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {body ? <p className="max-w-md text-sm text-muted-foreground">{body}</p> : null}
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="label-caps text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{title}</h1>
        {children}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 p-8 text-muted-foreground">
      <Icon name="refresh" className="size-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
