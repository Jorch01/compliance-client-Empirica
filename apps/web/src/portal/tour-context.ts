import { createContext, use } from 'react';

export interface TourContextValue {
  /** Shows the guided tour from the first step. */
  start: () => void;
}

export const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const value = use(TourContext);
  if (!value) throw new Error('useTour needs a <TourProvider>');
  return value;
}
