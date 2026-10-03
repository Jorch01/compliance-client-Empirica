import 'i18next';
import type { es } from './es.ts';

// Typed keys: t('auth.signIn') is checked by the compiler.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof es };
  }
}
