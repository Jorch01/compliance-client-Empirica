/**
 * What the contract screens share: the tone of each status and the light
 * of a contract's next key date.
 */
import { nextKeyDate, type ContractStatus, type Row } from '@empirica/shared';
import { urgencyOf, type Semaforo } from '../../domain/deadlines.ts';
import type { Tone } from '../../ui/StatusBadge.tsx';

export const CONTRACT_TONE: Record<ContractStatus, Tone> = {
  indefinido: 'neutral',
  vigente: 'success',
  renovado: 'warning',
  vencido: 'neutral',
};

/** The light of the next key date (notice or end); none when both passed. */
export function contractSemaforo(row: Row, today: string): Semaforo {
  const key = nextKeyDate(row, today);
  if (!key) return 'noDate';
  const u = urgencyOf(key.date, today);
  return u === 'none' ? 'noDate' : u;
}
