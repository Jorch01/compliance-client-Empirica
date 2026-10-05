import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, currentLanguage, setLanguage, type Language } from '../i18n/index.ts';
import { THEMES, setTheme, themePreference, type ThemePreference } from '../theme.ts';
import { Icon } from '../ui/Icon.tsx';

const THEME_ICON = { system: 'monitor', light: 'sun', dark: 'moon' } as const;

/**
 * Language and theme, as two compact selects (screens before signing in, user
 * menu). Signed in, the language is also the one of the person's emails and
 * calendar feed: `onLanguage` tells the server.
 */
export function PreferencesInline({
  className = '',
  onLanguage,
}: {
  className?: string;
  onLanguage?: (language: Language) => void;
}) {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Language>(currentLanguage());
  const [theme, setThemeState] = useState<ThemePreference>(themePreference());
  const select =
    'rounded-control border border-input bg-card py-1.5 pr-8 pl-8 text-sm text-foreground';
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <label className="relative inline-flex items-center">
        <span className="sr-only">{t('language.label')}</span>
        <Icon
          name="globe"
          className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
        />
        <select
          className={select}
          value={lang}
          onChange={(e) => {
            const next = e.target.value as Language;
            setLang(next);
            setLanguage(next);
            onLanguage?.(next);
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {t(`language.${l}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="relative inline-flex items-center">
        <span className="sr-only">{t('theme.label')}</span>
        <Icon
          name={THEME_ICON[theme]}
          className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
        />
        <select
          className={select}
          value={theme}
          onChange={(e) => {
            const next = e.target.value as ThemePreference;
            setThemeState(next);
            setTheme(next);
          }}
        >
          {THEMES.map((th) => (
            <option key={th} value={th}>
              {t(`theme.${th}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
