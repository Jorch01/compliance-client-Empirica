/**
 * Light, dark, or whatever the device prefers (the default). The CSS reads
 * `data-theme` on <html> (styles/tokens.css); "system" removes it.
 */
export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEMES)[number];

const KEY = 'empirica.theme';

export function themePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    /* private mode */
  }
  return 'system';
}

export function applyTheme(preference: ThemePreference = themePreference()): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

export function setTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(KEY, preference);
  } catch {
    /* private mode */
  }
  applyTheme(preference);
}
