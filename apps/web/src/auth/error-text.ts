import type { TFunction } from 'i18next';
import { AuthError } from './types.ts';

/**
 * What a failed sign-in says. An unexpected one also names Firebase's code
 * ("auth/internal-error"), so whoever reads it can tell the firm exactly
 * what failed instead of "try again".
 */
export function authErrorText(t: TFunction, error: unknown): string {
  const code = error instanceof AuthError ? error.code : 'unknown';
  const text = t(`auth.errors.${code}`);
  const detail =
    error instanceof AuthError && code === 'unknown' && error.message !== 'unknown'
      ? error.message
      : null;
  return detail ? `${text} (${detail})` : text;
}
