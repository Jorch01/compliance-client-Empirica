/**
 * Installing the portal on the device (DISENO.md § 8). The instructions
 * depend on the system; Chrome and Edge also offer their own install
 * dialog, which the portal keeps to open from its own button.
 */
import { useSyncExternalStore } from 'react';

export type Platform = 'ios' | 'android' | 'desktop';

export interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function detectPlatform(
  ua: string = navigator.userAgent,
  touchPoints: number = navigator.maxTouchPoints,
): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS presents itself as a Mac, but with touch.
  if (/Macintosh/i.test(ua) && touchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** On iOS only Safari installs: Chrome, Firefox and Edge there say so in their name. */
export function isIosOtherBrowser(ua: string = navigator.userAgent): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
}

/** Already opened as an installed app. */
export function isInstalled(): boolean {
  const standalone =
    typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();

/** Chrome's install dialog, if the browser offered it. */
export function installPrompt(): InstallPrompt | null {
  return deferred;
}

export function onInstallPromptChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opens the browser's install dialog; true when the user installed. */
export async function promptInstall(): Promise<boolean> {
  const prompt = deferred;
  if (!prompt) return false;
  deferred = null;
  for (const l of listeners) l();
  await prompt.prompt();
  return (await prompt.userChoice).outcome === 'accepted';
}

/** Called once at startup: keep the browser's offer for our own button. */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPrompt;
    for (const l of listeners) l();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    for (const l of listeners) l();
  });
}

/** Whether the browser offered its install dialog (re-renders when that changes). */
export function useInstallPrompt(): boolean {
  return useSyncExternalStore(onInstallPromptChange, () => installPrompt() !== null);
}
