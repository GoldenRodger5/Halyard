import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
    ],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@halyard/core': path.resolve(root, 'packages/core/src'),
      '@halyard/db': path.resolve(root, 'packages/db/src'),
      '@halyard/render': path.resolve(root, 'packages/render/src'),
      '@halyard/ui': path.resolve(root, 'packages/ui/src'),
    },
  },
});
