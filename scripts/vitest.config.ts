import { defineProject } from 'vitest/config';

// The repository's own scripts (the publication's helpers), in Node.
export default defineProject({
  test: {
    name: 'scripts',
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
