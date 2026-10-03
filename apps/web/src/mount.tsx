import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/montserrat';
import './styles/app.css';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

/** Renders one page of the site into #root, with the brand's fonts and styles. */
export function mount(page: ReactNode): void {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  createRoot(root).render(<StrictMode>{page}</StrictMode>);
}
