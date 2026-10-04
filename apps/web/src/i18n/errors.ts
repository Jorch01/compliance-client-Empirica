import type { TFunction } from 'i18next';
import { ApiCallError, NetworkError } from '../api/client.ts';

/**
 * A failed online action, in the user's words. Validation and conflict
 * messages from the server name the exact problem ("that person already
 * has access"), so they are shown as they come.
 */
export function apiErrorText(t: TFunction, error: unknown): string {
  if (error instanceof NetworkError) return t('errors.NETWORK');
  if (error instanceof ApiCallError) {
    if ((error.code === 'VALIDATION' || error.code === 'CONFLICT') && error.message) {
      return error.message;
    }
    return t(`errors.${error.code}`);
  }
  return t('errors.UNKNOWN');
}
