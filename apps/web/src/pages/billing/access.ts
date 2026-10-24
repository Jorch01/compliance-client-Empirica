import { hasBillingAccess } from '@empirica/shared';
import { useRow } from '../../data/hooks.ts';
import { usePortal } from '../../session/context.ts';

/**
 * Whether this person works billing (F9): a partner, or a lawyer a partner
 * authorized. Read from their own row on the device, so a change shows at
 * the next sync, without signing in again.
 */
export function useBillingAccess(): boolean {
  const { me } = usePortal();
  const self = useRow('Usuarios', me.id);
  return self ? hasBillingAccess(self) : me.billing;
}
