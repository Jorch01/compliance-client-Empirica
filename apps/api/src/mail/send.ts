/**
 * Email from the portal (MailApp, F5): sent by the owner account under the
 * name "Empírica Portal", replies to whoever the message names. A free
 * account may email 100 recipients a day (docs/LIMITES.md); MailApp tells
 * how many are left, and a failure never stops the action that sends.
 */
import type { Env } from '../env.ts';

export const SENDER_NAME = 'Empírica Portal';

export interface MailOutcome {
  sent: boolean;
  /** QUOTA when the day's emails ran out; otherwise Google's words. */
  error: string | null;
}

/** Recipients left today (0 if MailApp cannot say). */
export function remainingQuota(env: Env): number {
  try {
    return env.g.MailApp.getRemainingDailyQuota();
  } catch {
    return 0;
  }
}

/** "p•••@cliente.example": enough for a log, not an address. */
const masked = (email: string): string => email.replace(/^(.).*(@.*)$/, '$1•••$2');

export function sendMail(
  env: Env,
  message: { to: string; subject: string; text: string; html: string; replyTo?: string | null },
): MailOutcome {
  if (remainingQuota(env) < 1) return { sent: false, error: 'QUOTA' };
  try {
    env.g.MailApp.sendEmail({
      to: message.to,
      subject: message.subject,
      body: message.text,
      htmlBody: message.html,
      name: SENDER_NAME,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    return { sent: true, error: null };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    env.log('Correo no enviado', { to: masked(message.to), error: text });
    return {
      sent: false,
      error: /too many times|quota/i.test(text) ? 'QUOTA' : text.slice(0, 200),
    };
  }
}
