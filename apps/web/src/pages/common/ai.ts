/**
 * The AI helpers on screen (F6, IA.md): whether they are on for a client
 * (the server says so at sign-in) and their failures in the user's words.
 */
import type { TFunction } from 'i18next';
import { ApiCallError } from '../../api/client.ts';
import { apiErrorText } from '../../i18n/errors.ts';
import { oneOf } from '../../i18n/labels.ts';
import type { Me } from '../../session/context.ts';

const AI_REASONS = [
  'AI_OFF',
  'AI_NO_KEY',
  'AI_BAD_KEY',
  'AI_QUOTA',
  'AI_NO_ANSWER',
  'AI_NO_MODEL',
  'INTERNAL_TASK',
  'NOT_CLIENT_SIDE',
] as const;

/** Whether the AI helpers are on: for one client, or for any of the user's. */
export function aiOn(me: Me, clienteId: string | null): boolean {
  return clienteId
    ? me.clients.some((c) => c.id === clienteId && c.ia)
    : me.clients.some((c) => c.ia);
}

export function aiErrorText(t: TFunction, error: unknown): string {
  if (error instanceof ApiCallError && oneOf(AI_REASONS, error.reason)) {
    return t(`ai.errors.${error.reason}`);
  }
  return apiErrorText(t, error);
}
