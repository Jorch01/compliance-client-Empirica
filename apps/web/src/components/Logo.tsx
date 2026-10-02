import { logos } from '@empirica/shared/brand';

interface LogoProps {
  /** Which official artwork: full logo, wordmark only, symbol only, or the circular seal. */
  variant?: keyof typeof logos;
  className?: string;
  /** Accessible name; pass an empty string when the logo sits next to visible text. */
  label?: string;
}

/** The firm's logo as vector outlines, drawn in the current text color. */
export function Logo({ variant = 'logo', className, label = 'Empírica Legal Lab' }: LogoProps) {
  const { viewBox, paths } = logos[variant];
  return (
    <svg
      viewBox={viewBox}
      className={className}
      fill="currentColor"
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
