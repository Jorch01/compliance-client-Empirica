// IndexedDB for jsdom, before Dexie loads (it reads the global once).
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { i18n } from '../i18n/index.ts';

// The screens are tested in Spanish (Mexico), the portal's main language.
await i18n.changeLanguage('es');

// Without Vitest globals, Testing Library cannot unmount on its own: each
// test starts from an empty page, and without what the last one stored.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
