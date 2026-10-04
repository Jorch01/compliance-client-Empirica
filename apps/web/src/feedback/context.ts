import { createContext, use } from 'react';

export type FeedbackKind = 'SUGERENCIA' | 'ERROR';

export interface FeedbackContextValue {
  /** Opens the form; from a crash, as an error report that names the error. */
  open: (options?: { tipo?: FeedbackKind; error?: unknown }) => void;
}

export const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback(): FeedbackContextValue {
  const value = use(FeedbackContext);
  if (!value) throw new Error('useFeedback needs a <FeedbackProvider>');
  return value;
}
