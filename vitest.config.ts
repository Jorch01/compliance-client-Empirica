import { defineConfig } from 'vitest/config';

// One run covers every workspace; each project brings its own environment.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
