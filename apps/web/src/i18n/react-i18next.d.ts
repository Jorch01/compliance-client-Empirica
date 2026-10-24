import 'i18next';
import type { billingEs } from './billing-es.ts';
import type { es } from './es.ts';

// Typed keys: t('auth.signIn') is checked by the compiler.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    // Billing's texts load with its screens (pages/billing/texts.ts).
    resources: { translation: typeof es & { billing: typeof billingEs } };
  }
}
