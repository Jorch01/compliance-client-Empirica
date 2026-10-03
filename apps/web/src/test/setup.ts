import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Without Vitest globals, Testing Library cannot unmount on its own: each
// test starts from an empty page.
afterEach(cleanup);
