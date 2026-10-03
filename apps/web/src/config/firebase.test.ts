/**
 * The portal talks to the right Firebase project, and the browser key never
 * lands in the public repository (it comes from the environment).
 */
import { describe, expect, it } from 'vitest';
import { firebaseConfig } from './firebase.ts';

// Every source file of the web app, as text (Vite reads them; no Node APIs).
const sources = import.meta.glob<string>(
  ['../**/*', '../../index.html', '../../privacidad/**/*', '../../public/**/*'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

describe('Firebase configuration', () => {
  it('points to the portal project, whose tokens the server accepts', () => {
    expect(firebaseConfig.projectId).toBe('empirica-portal-d86b4');
    expect(firebaseConfig.authDomain).toBe(`${firebaseConfig.projectId}.firebaseapp.com`);
  });

  it('keeps the API key out of the repository', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(5);
    const leaks = Object.entries(sources)
      .filter(([, text]) => /AIza[0-9A-Za-z_-]{35}/.test(text))
      .map(([path]) => path);
    expect(leaks).toEqual([]);
  });
});
