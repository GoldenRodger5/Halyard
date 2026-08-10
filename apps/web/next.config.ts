import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build step, so Next
  // compiles them alongside the app. Keeps the monorepo free of a dist/ dance.
  transpilePackages: ['@halyard/core', '@halyard/db', '@halyard/render', '@halyard/ui'],
  serverExternalPackages: ['pg', 'sharp', '@resvg/resvg-js'],
  typedRoutes: false,

  env: {
    // Read by /settings/readiness to say which build is deployed, so a
    // regression can be mapped to a change rather than guessed at.
    HALYARD_RELEASE:
      process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
  },

  webpack(config, { isServer }) {
    // The workspace packages are ESM TypeScript and import with explicit `.js`
    // specifiers, which is what Node and vitest want. The bundler needs to be
    // told that a `.js` specifier may resolve to the `.ts` source next to it.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };

    if (isServer) {
      // resvg and sharp ship native `.node` binaries. `serverExternalPackages`
      // alone does not cover them here, because they are reached through a
      // transpiled workspace package rather than imported directly.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        '@resvg/resvg-js',
        'sharp',
      ];
    }

    return config;
  },
};

export default config;
