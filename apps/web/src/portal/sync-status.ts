import { useSyncExternalStore } from 'react';
import { usePortal } from '../session/context.ts';
import type { SyncStatus } from '../sync/engine.ts';

/** The sync engine's status, re-rendering on every change. */
export function useSyncStatus(): SyncStatus {
  const { engine } = usePortal();
  return useSyncExternalStore(engine.subscribe, engine.getStatus);
}
