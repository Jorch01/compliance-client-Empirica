import { useEffect, useRef, useState } from 'react';

/**
 * The width of an element, kept up to date: a chart draws in real pixels,
 * so its text stays legible on a phone instead of shrinking with it.
 */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.round(w));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  return { ref, width };
}
