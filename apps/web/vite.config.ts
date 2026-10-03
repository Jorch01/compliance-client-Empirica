/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// The brand color comes from the generated tokens, never typed twice.
const tokens = JSON.parse(
  readFileSync(new URL('../../packages/shared/src/brand/tokens.json', import.meta.url), 'utf8'),
) as { brand: { green: string } };

function brandHtml(): Plugin {
  return {
    name: 'empirica-brand-html',
    transformIndexHtml: (html) => html.replaceAll('%BRAND_THEME_COLOR%', tokens.brand.green),
  };
}

export default defineConfig({
  // "/" for portal.empirica.mx; "/<repo>/" if served from <user>.github.io/<repo>/.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), brandHtml()],
  build: {
    rolldownOptions: {
      // One HTML file per public address: /privacidad/ answers on its own,
      // without depending on a redirect to the app.
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        privacidad: fileURLToPath(new URL('privacidad/index.html', import.meta.url)),
      },
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
