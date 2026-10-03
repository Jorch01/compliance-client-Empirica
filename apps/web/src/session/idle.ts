import { useEffect, useRef } from 'react';

const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Calls `onIdle` after `minutes` without any interaction (PLAN.md § 3: the
 * portal locks, but keeps the local data). Time spent with the device asleep
 * counts too: the check compares clocks, not timers.
 */
export function useIdle(minutes: number, active: boolean, onIdle: () => void): void {
  const last = useRef(0);
  const callback = useRef(onIdle);
  useEffect(() => {
    callback.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!active) return;
    last.current = Date.now();
    const touch = (): void => {
      last.current = Date.now();
    };
    for (const e of EVENTS) window.addEventListener(e, touch, { passive: true });
    const check = (): void => {
      if (Date.now() - last.current >= minutes * 60_000) callback.current();
    };
    const timer = setInterval(check, 15_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, touch);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [minutes, active]);
}
