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
      // The operator scripts are shipped code too, and one of them is the only
      // destructive command in the repository. §154.
      'scripts/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      // Ordered: the subpath has to match before the package root, because
      // Vite resolves aliases by prefix in declaration order and
      // '@halyard/render' is a prefix of '@halyard/render/timing'. The general
      // alias would otherwise rewrite it to src/timing, which does not exist.
      '@halyard/render/timing': path.resolve(root, 'packages/render/src/video/timing.ts'),
      '@halyard/render/video-props': path.resolve(
        root,
        'packages/render/src/video/artifactProps.ts',
      ),
      '@halyard/core': path.resolve(root, 'packages/core/src'),
      '@halyard/db': path.resolve(root, 'packages/db/src'),
      '@halyard/render': path.resolve(root, 'packages/render/src'),
      '@halyard/ui': path.resolve(root, 'packages/ui/src'),
    },
  },
});
