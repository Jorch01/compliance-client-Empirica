/**
 * Interface languages: Spanish (Mexico) first, complete English. The choice
 * is kept per device; dates and numbers follow it, always in the project's
 * time zone (America/Cancun).
 */
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en.ts';
import { es } from './es.ts';

export const LANGUAGES = ['es', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const KEY = 'empirica.language';
export const TIME_ZONE = 'America/Cancun';

export function preferredLanguage(): Language {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    /* private mode */
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')
    ? 'en'
    : 'es';
}

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: preferredLanguage(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
  initAsync: false,
});

export function currentLanguage(): Language {
  return i18n.language === 'en' ? 'en' : 'es';
}

export function setLanguage(language: Language): void {
  try {
    localStorage.setItem(KEY, language);
  } catch {
    /* private mode */
  }
  void i18n.changeLanguage(language);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language === 'es' ? 'es-MX' : 'en';
  }
}

const locale = (): string => (currentLanguage() === 'es' ? 'es-MX' : 'en-US');

/** "15 oct 2026" for a date ("2026-10-15") or an instant. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00-05:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(date);
}

/** "15 oct, 10:30" for an instant. */
export function formatDateTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(date);
}

/** "10:00–11:00 a.m." for a stretch of one day (or just "10:00 a.m."), in Cancún. */
export function formatTimeRange(start: string, end: string | null): string {
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return start;
  const format = new Intl.DateTimeFormat(locale(), {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  });
  const to = end ? new Date(end) : null;
  return to && to.getTime() > from.getTime() ? format.formatRange(from, to) : format.format(from);
}

/** "lunes, 5 de octubre" for a day ("2026-10-05"). */
export function formatDayHeading(day: string): string {
  const date = new Date(`${day}T12:00:00-05:00`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TIME_ZONE,
  }).format(date);
}

export const languageTag = locale;
