/**
 * The owner account's consent to the Google services the portal uses (F5).
 * Google's consent screen lets the account grant only some of the
 * permissions the project asks for (granular consent), so the portal asks
 * before using Calendar or email: without the permission it waits quietly
 * (no failing trigger every 15 minutes, no summary marked as sent) and
 * `setup` asks again for whatever is missing.
 */
import type { Env } from './env.ts';

export const SCOPES = {
  calendar: 'https://www.googleapis.com/auth/calendar',
  mail: 'https://www.googleapis.com/auth/script.send_mail',
} as const;

/** Whether the owner granted this permission (true when Google cannot say: the call itself will). */
export function hasScope(env: Env, scope: string): boolean {
  const { ScriptApp } = env.g;
  try {
    const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, [scope]);
    return info.getAuthorizationStatus() !== ScriptApp.AuthorizationStatus.REQUIRED;
  } catch {
    return true;
  }
}

/**
 * In the editor: if any permission of the manifest is missing, Google ends
 * this run and shows its consent window again ("Seleccionar todo").
 */
export function requireAllScopes(env: Env): void {
  const { ScriptApp } = env.g;
  if (typeof ScriptApp.requireAllScopes === 'function') {
    ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  }
}
