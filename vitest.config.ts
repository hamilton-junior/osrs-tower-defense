import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    // Pure game-logic modules don't touch the DOM, so the lightweight
    // node environment keeps the suite fast.
    environment: 'node',
    // Game logic is TypeScript under lib/; the build-time bake scripts are plain
    // ESM, and their pure helpers are tested beside them as .mjs.
    include: ['lib/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
});
