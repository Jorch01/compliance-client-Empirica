/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { mockApi } from './mock/plugin.ts';
import { portalPolicy, privacyPolicy } from './src/security/csp.ts';

// The brand color comes from the generated tokens, never typed twice.
const tokens = JSON.parse(
  readFileSync(new URL('../../packages/shared/src/brand/tokens.json', import.meta.url), 'utf8'),
) as { brand: { green: string }; themes: { light: { colors: { background: string } } } };

const pkg = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function brandHtml(): Plugin {
  return {
    name: 'empirica-brand-html',
    transformIndexHtml: (html) => html.replaceAll('%BRAND_THEME_COLOR%', tokens.brand.green),
  };
}

/**
 * Every built page carries its security policy (src/security/csp.ts) before
 * anything it governs. Not in the dev server, whose inline scripts it would stop.
 */
function securityPolicy(apiUrl: string | undefined): Plugin {
  const charset = '<meta charset="UTF-8" />';
  return {
    name: 'empirica-security-policy',
    apply: 'build',
    transformIndexHtml: (html, ctx) => {
      if (!html.includes(charset)) throw new Error(`${ctx.path}: falta ${charset}`);
      const policy = ctx.path.includes('privacidad') ? privacyPolicy() : portalPolicy(apiUrl);
      return html.replace(
        charset,
        `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  // "/" for portal.empirica.mx; "/<repo>/" if served from <user>.github.io/<repo>/.
  base: process.env.VITE_BASE ?? '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // The demo also runs in GitHub Codespaces (docs/PLAN.md § 15), whose
  // forwarded address is a subdomain of app.github.dev.
  server: { allowedHosts: ['.app.github.dev'] },
  plugins: [
    react(),
    tailwindcss(),
    brandHtml(),
    securityPolicy(
      loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_').VITE_API_URL,
    ),
    // Installable and usable offline (PLAN.md § 5): our own service worker
    // (sw/sw.ts) keeps the app on the device; it registers in builds only.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'sw',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'prompt',
      injectManifest: {
        // woff: the report's PDF fonts (pdfmake does not read woff2).
        globPatterns: ['**/*.{html,js,css,woff2,woff,svg,png}'],
        // Spanish and English need the Latin fonts only.
        globIgnores: [
          '**/*-{cyrillic,cyrillic-ext,greek,vietnamese}-*.woff2',
          // The demo sign-in is never loaded by the real portal.
          ...(mode === 'mock' ? [] : ['**/MockSignIn-*.js', '**/mock-*.js']),
        ],
        // The fonts and the Firebase chunk are large but needed offline.
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
      manifest: {
        id: '/',
        name: 'Empírica Portal',
        short_name: 'Empírica',
        description: 'Portal de clientes de Empírica Legal Lab · Fractional Legal Team',
        lang: 'es-MX',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: tokens.themes.light.colors.background,
        theme_color: tokens.brand.green,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
    // The real backend with fictitious data, only in mock mode (npm run dev:mock).
    ...(mode === 'mock' ? [mockApi(fileURLToPath(new URL('../api/src', import.meta.url)))] : []),
  ],
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
    // integration/: the sync engine against the real backend (apps/api test world).
    include: ['src/**/*.test.{ts,tsx}', 'integration/**/*.test.ts'],
  },
}));
