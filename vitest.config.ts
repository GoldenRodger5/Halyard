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
    /*
     * §565. No test reaches a provider or spends money by accident.
     *
     * Gotcha 12 tells you to source the env file to stop database suites
     * skipping; that same file hands every test a live billable credential.
     * This setup blocks non-local `fetch` and neuters the paid keys.
     */
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30_000,
    /*
     * §386. Long enough to build a database.
     *
     * Twenty-one suites open an isolated pool in `beforeAll`, and
     * `createIsolatedPool` creates a database and applies every migration into
     * it. Under a full parallel run that legitimately exceeds a minute — it is
     * slow work, not hung work.
     *
     * Twelve of those suites had already discovered this and set `}, 120_000)`
     * on the hook individually. Eight had not, and were inheriting 60s; they
     * passed only when the scheduler happened to put them on a quiet machine.
     * `schema.test.ts` had settled on 90s, which is what actually tripped:
     * thirteen tests went dark in one run.
     *
     * A timeout that every caller has to remember is a rule that will be wrong
     * at some of the sites, so it belongs to the operation rather than to each
     * caller. This is the operation's number.
     */
    hookTimeout: 120_000,
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
      /*
       * §567. `@/` is the web app's own alias, from its tsconfig.
       *
       * Without it, nothing under `apps/web/src` that imports `@/lib/...` could
       * be unit-tested at all — the release check lives there and is exactly the
       * kind of code that has to be tested rather than reasoned about.
       */
      '@/': `${path.resolve(root, 'apps/web/src')}/`,
      // Next's build-time guard; it has nothing to enforce under vitest. See the stub.
      'server-only': path.resolve(root, 'test/serverOnlyStub.ts'),
      '@halyard/core': path.resolve(root, 'packages/core/src'),
      '@halyard/db': path.resolve(root, 'packages/db/src'),
      '@halyard/render': path.resolve(root, 'packages/render/src'),
      '@halyard/ui/studio': path.resolve(root, 'packages/ui/src/studio/index.tsx'),
      '@halyard/ui': path.resolve(root, 'packages/ui/src'),
    },
  },
});
