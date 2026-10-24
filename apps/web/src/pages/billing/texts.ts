/**
 * Billing's texts (F9), outside the first load: the screens that use them
 * bring them, and they join the interface's dictionary as soon as one of
 * those screens' code arrives (before it draws).
 */
import { billingEn } from '../../i18n/billing-en.ts';
import { billingEs } from '../../i18n/billing-es.ts';
import { i18n } from '../../i18n/index.ts';

i18n.addResourceBundle('es', 'translation', { billing: billingEs }, true, true);
i18n.addResourceBundle('en', 'translation', { billing: billingEn }, true, true);
