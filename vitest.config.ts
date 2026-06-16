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
    include: ['lib/**/*.test.ts'],
  },
});
