// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/dist-mock/**',
    '**/build/**',
    '**/coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Config files run in Node and are not part of any package's tsconfig.
  {
    files: ['**/*.js', '**/*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Shared code runs in the browser AND in Apps Script: no Node APIs outside
  // tests and their test doubles (src/testing).
  {
    files: ['packages/shared/src/**/*.ts', 'apps/api/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/src/testing/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'This code also runs in Apps Script and the browser.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'process', 'Buffer', '__dirname', 'require'],
      // The named `z` carries every locale of zod: Code.js grew from 390 KB to 1 MB.
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration[source.value=/^zod/] > ImportSpecifier[imported.name='z']",
          message: "Use `import * as z from 'zod/mini'`: only what is used is bundled.",
        },
      ],
    },
  },

  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  {
    files: ['scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  prettier,
]);
