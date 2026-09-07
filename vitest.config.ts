import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Automatic runtime so importing a .tsx component (e.g. for a direct,
  // no-jsdom render test) doesn't need `React` in scope — matches how
  // Next.js itself compiles JSX, unlike esbuild's classic-transform default.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
